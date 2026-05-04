import { z } from "zod";
import { OrchestratorAuthError, OrchestratorTransportError } from "./errors.js";
import type { AccessToken, TenantConnectionConfig } from "./types.js";

// Per UiPath docs: response is {access_token, token_type, expires_in, scope}.
// We zod-validate before trusting any field — external boundary.
const TokenResponse = z.object({
  access_token: z.string().min(1),
  token_type: z.string().min(1),
  expires_in: z.number().int().positive(),
  scope: z.string().optional(),
});

export interface TokenManagerOptions {
  // Injectable for tests. Defaults to global fetch.
  readonly fetch?: typeof fetch;
  // Injectable for tests. Defaults to () => new Date().
  readonly clock?: () => Date;
  // Refresh when elapsed/lifetime >= threshold. Default 0.8 per spec.
  readonly refreshThreshold?: number;
}

const DEFAULT_REFRESH_THRESHOLD = 0.8;

// One TokenManager per tenant. Holds the cached token in memory only —
// never written to disk or logs (spec invariant #6).
export class TokenManager {
  readonly #config: TenantConnectionConfig;
  readonly #fetch: typeof fetch;
  readonly #clock: () => Date;
  readonly #refreshThreshold: number;

  #cached: AccessToken | undefined;
  #inflight: Promise<AccessToken> | undefined;

  constructor(config: TenantConnectionConfig, options: TokenManagerOptions = {}) {
    this.#config = config;
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#clock = options.clock ?? (() => new Date());
    this.#refreshThreshold = options.refreshThreshold ?? DEFAULT_REFRESH_THRESHOLD;
  }

  async getToken(): Promise<AccessToken> {
    if (this.#cached !== undefined && !this.#isStale(this.#cached)) {
      return this.#cached;
    }
    if (this.#inflight !== undefined) {
      return this.#inflight;
    }
    this.#inflight = this.#fetchToken().finally(() => {
      this.#inflight = undefined;
    });
    return this.#inflight;
  }

  // Useful for tests and observability. Does NOT trigger a refresh.
  isCacheValid(): boolean {
    return this.#cached !== undefined && !this.#isStale(this.#cached);
  }

  #isStale(token: AccessToken): boolean {
    const now = this.#clock().getTime();
    const lifetime = token.expiresAt.getTime() - token.obtainedAt.getTime();
    const refreshAt = token.obtainedAt.getTime() + lifetime * this.#refreshThreshold;
    return now >= refreshAt;
  }

  async #fetchToken(): Promise<AccessToken> {
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.#config.clientId,
      client_secret: this.#config.clientSecret,
      scope: this.#config.scopes.join(" "),
    });

    const obtainedAt = this.#clock();

    let response: Response;
    try {
      response = await this.#fetch(this.#config.identityTokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
    } catch (cause) {
      throw new OrchestratorTransportError("Failed to reach Orchestrator identity endpoint.", { cause });
    }

    if (!response.ok) {
      const text = await safeText(response);
      throw new OrchestratorAuthError(
        `Orchestrator identity endpoint returned HTTP ${response.status}: ${text}`,
        { details: { status: response.status, body: text } },
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (cause) {
      throw new OrchestratorAuthError("Identity endpoint returned non-JSON response.", { cause });
    }

    const parsed = TokenResponse.safeParse(payload);
    if (!parsed.success) {
      throw new OrchestratorAuthError("Identity endpoint response did not match the expected token shape.", {
        details: { issues: parsed.error.issues },
      });
    }

    const expiresAt = new Date(obtainedAt.getTime() + parsed.data.expires_in * 1000);
    const scopesGranted = parsed.data.scope === undefined ? [] : parsed.data.scope.split(/\s+/u).filter(Boolean);

    const token: AccessToken = {
      token: parsed.data.access_token,
      tokenType: parsed.data.token_type,
      expiresAt,
      obtainedAt,
      scopesGranted,
    };
    this.#cached = token;
    return token;
  }
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "<unreadable response body>";
  }
}
