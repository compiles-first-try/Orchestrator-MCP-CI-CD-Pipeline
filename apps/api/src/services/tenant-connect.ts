import { encryptSecret, RpaPlatformError, type TenantName } from "@rpa-platform/shared";
import {
  OrchestratorAuthError,
  OrchestratorTransportError,
  TokenManager,
  type TenantConnectionConfig,
} from "@rpa-platform/orchestrator-client";
import type { ProjectRepo } from "../db-adapters/projects.js";
import type { ProjectTenantRepo } from "../db-adapters/project-tenants.js";

export class TenantConnectError extends RpaPlatformError {
  constructor(message: string, code = "tenant.connect_failed", options: { cause?: unknown; details?: Readonly<Record<string, unknown>> } = {}) {
    super(code, message, options);
  }
}

export interface TenantConnectInput {
  readonly projectName: string;
  readonly tenant: TenantName;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly folderId: string;
  readonly orchestratorUrl?: string;
  readonly identityTokenUrl: string;
  readonly scopes: readonly string[];
  readonly correlationId?: string;
  // When false, skip the live token-fetch validation step. Useful for
  // smoke-testing wiring without a real Orchestrator on the other end.
  readonly validate?: boolean;
}

export interface TenantConnectResult {
  readonly projectId: string;
  readonly status: "connected" | "auth_failed";
  readonly tokenLifetimeSeconds: number | undefined;
}

export interface TenantConnectDeps {
  readonly projects: ProjectRepo;
  readonly projectTenants: ProjectTenantRepo;
  readonly encryptionKey: Buffer;
  // Optional fetch override for tests.
  readonly fetch?: typeof fetch;
}

// SECURITY CONTRACT (memory: no_secrets_in_chat):
//   - `input.clientSecret` is the only field that holds the plaintext OAuth
//     secret. It is consumed by an ad-hoc TokenManager (validation only —
//     the manager is GC'd when validation returns) and by encryptSecret()
//     before being written to project_tenants. Plaintext is NEVER:
//       - persisted (only the AES-256-GCM blob is stored),
//       - logged (Fastify's default request logger doesn't include bodies;
//         do NOT enable trace-level body logging in production),
//       - included in thrown errors' `message`, `details`, or `cause` fields,
//       - returned in API responses, audit events, or Slack DMs.
//   - The thrown TenantConnectError below limits `details` to projectName
//     and tenant only. Don't add the secret here.

// Persists tenant credentials and (optionally) validates them by fetching a
// token from the Orchestrator identity endpoint. On a successful token
// fetch we mark the row `connected`; on failure we mark `auth_failed` and
// surface the error so the admin can correct the inputs.
export class TenantConnectService {
  readonly #deps: TenantConnectDeps;

  constructor(deps: TenantConnectDeps) {
    this.#deps = deps;
  }

  async connect(input: TenantConnectInput): Promise<TenantConnectResult> {
    const project = await this.#deps.projects.getByName(input.projectName);
    if (project === undefined) {
      throw new TenantConnectError(
        `Project '${input.projectName}' is not registered. Run \`/rpa new\` first.`,
        "tenant.connect_project_not_found",
      );
    }

    let tokenLifetimeSeconds: number | undefined;
    let status: "connected" | "auth_failed" = "connected";

    if (input.validate !== false) {
      try {
        tokenLifetimeSeconds = await fetchTokenLifetime(
          {
            identityTokenUrl: input.identityTokenUrl,
            clientId: input.clientId,
            clientSecret: input.clientSecret,
            scopes: input.scopes,
          },
          this.#deps.fetch,
        );
      } catch (err) {
        status = "auth_failed";
        // We deliberately do NOT persist the credentials when validation
        // fails. The user retries with the corrected secret; the previous
        // (possibly working) credentials remain untouched.
        throw new TenantConnectError(
          `Validation against Orchestrator failed: ${(err as Error).message}`,
          "tenant.connect_validation_failed",
          { cause: err, details: { projectName: input.projectName, tenant: input.tenant } },
        );
      }
    }

    const encrypted = encryptSecret(input.clientSecret, this.#deps.encryptionKey);
    await this.#deps.projectTenants.upsert({
      projectId: project.id,
      tenantName: input.tenant,
      oauthClientId: input.clientId,
      oauthClientSecretEncrypted: encrypted,
      oauthScopes: [...input.scopes],
      folderId: input.folderId,
      ...(input.orchestratorUrl !== undefined && { orchestratorUrl: input.orchestratorUrl }),
      status,
    });

    return { projectId: project.id, status, tokenLifetimeSeconds };
  }
}

async function fetchTokenLifetime(
  config: TenantConnectionConfig,
  fetchImpl: typeof fetch | undefined,
): Promise<number> {
  // We construct an ad-hoc TokenManager just to validate. The token it
  // fetches is intentionally not retained — `connect()` doesn't expose a
  // way to leak it; the manager is GC'd as soon as this function returns.
  const manager = new TokenManager(
    config,
    fetchImpl === undefined ? {} : { fetch: fetchImpl },
  );
  try {
    const token = await manager.getToken();
    return Math.floor((token.expiresAt.getTime() - token.obtainedAt.getTime()) / 1000);
  } catch (err) {
    if (err instanceof OrchestratorAuthError || err instanceof OrchestratorTransportError) {
      throw err;
    }
    throw new TenantConnectError(
      `Unexpected error during token validation: ${(err as Error).message}`,
      "tenant.connect_validation_unexpected",
      { cause: err },
    );
  }
}
