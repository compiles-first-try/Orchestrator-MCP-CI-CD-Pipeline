import { decryptSecret } from "@rpa-platform/shared";
import { z } from "zod";
import { OrchestratorAuthError, OrchestratorTransportError } from "./errors.js";

export type FetchFn = typeof globalThis.fetch;

export interface TokenManagerConfig {
  readonly tokenUrl: string;
  readonly clientId: string;
  readonly encryptedClientSecret: string;
  readonly scopes: readonly string[];
  readonly encryptionKey: Buffer;
  readonly fetch?: FetchFn;
  readonly clock?: () => number;
  readonly refreshAtFraction?: number;
}

interface CachedToken {
  readonly accessToken: string;
  readonly refreshAtMs: number;
}

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  token_type: z.string().optional(),
});

export class TokenManager {
  private readonly tokenUrl: string;
  private readonly clientId: string;
  private readonly encryptedClientSecret: string;
  private readonly scopes: readonly string[];
  private readonly encryptionKey: Buffer;
  private readonly fetchFn: FetchFn;
  private readonly clock: () => number;
  private readonly refreshAtFraction: number;
  private cached: CachedToken | undefined;
  private inflight: Promise<string> | undefined;

  constructor(config: TokenManagerConfig) {
    this.tokenUrl = config.tokenUrl;
    this.clientId = config.clientId;
    this.encryptedClientSecret = config.encryptedClientSecret;
    this.scopes = config.scopes;
    this.encryptionKey = config.encryptionKey;
    this.fetchFn = config.fetch ?? globalThis.fetch;
    this.clock = config.clock ?? Date.now;
    this.refreshAtFraction = config.refreshAtFraction ?? 0.8;
  }

  async getAccessToken(): Promise<string> {
    if (this.cached !== undefined && this.clock() < this.cached.refreshAtMs) {
      return this.cached.accessToken;
    }
    if (this.inflight !== undefined) return this.inflight;
    this.inflight = this.fetchToken().finally(() => {
      this.inflight = undefined;
    });
    return this.inflight;
  }

  invalidate(): void {
    this.cached = undefined;
  }

  private async fetchToken(): Promise<string> {
    const clientSecret = decryptSecret(this.encryptedClientSecret, this.encryptionKey);
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.clientId,
      client_secret: clientSecret,
      scope: this.scopes.join(" "),
    });
    let response: Response;
    try {
      response = await this.fetchFn(this.tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
    } catch (cause) {
      throw new OrchestratorTransportError("token endpoint unreachable", { cause });
    }
    if (response.status === 401 || response.status === 403) {
      const text = await safeText(response);
      throw new OrchestratorAuthError(`HTTP ${response.status} ${text.slice(0, 256)}`);
    }
    if (response.ok === false) {
      const text = await safeText(response);
      throw new OrchestratorTransportError(`HTTP ${response.status} ${text.slice(0, 256)}`);
    }
    const json: unknown = await response.json().catch(() => undefined);
    const parsed = tokenResponseSchema.safeParse(json);
    if (parsed.success === false) {
      throw new OrchestratorAuthError("token response did not match expected shape", {
        details: { issues: parsed.error.issues },
      });
    }
    const refreshAtMs =
      this.clock() + Math.floor(parsed.data.expires_in * 1000 * this.refreshAtFraction);
    this.cached = { accessToken: parsed.data.access_token, refreshAtMs };
    return parsed.data.access_token;
  }
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}
