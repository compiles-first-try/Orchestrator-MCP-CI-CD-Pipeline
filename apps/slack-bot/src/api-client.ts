import type {
  ApiClient,
  NewProjectRequest,
  ReconcileRequest,
  TenantConnectRequest,
} from "./commands/handlers.js";

// Thin HTTP wrapper that the slack-bot uses to call the platform API. The
// actual reconcile request body needs the project's config files and tenant
// metadata — those are loaded by the API server from the project repo on
// behalf of the user. The bot just forwards the verb intent.
export interface HttpApiClientOptions {
  readonly baseUrl: string;
  readonly fetch?: typeof fetch;
}

export function createHttpApiClient(options: HttpApiClientOptions): ApiClient {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const baseUrl = options.baseUrl.replace(/\/+$/u, "");

  return {
    async reconcileDryRun(args: ReconcileRequest) {
      return invoke(fetchImpl, baseUrl, "/reconcile/dry-run", args);
    },
    async reconcileApply(args: ReconcileRequest) {
      return invoke(fetchImpl, baseUrl, "/reconcile/apply", args);
    },
    async createProject(args: NewProjectRequest) {
      // Bot does not pass devBucketId/devFolderId — the bucket/folder ids
      // are filled in by `/rpa tenant connect` afterwards. The API route
      // accepts that and skips the seed-Config.json step in this case,
      // returning a `nextStep` hint we surface back to Slack.
      return invoke(fetchImpl, baseUrl, "/projects", args);
    },
    async connectTenant(args: TenantConnectRequest) {
      return invoke(fetchImpl, baseUrl, "/tenants/connect", args);
    },
  };
}

async function invoke(
  fetchImpl: typeof fetch,
  baseUrl: string,
  path: string,
  body: unknown,
): Promise<{ summary: string }> {
  const response = await fetchImpl(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return { summary: `:x: API ${path} returned ${response.status}: ${text}` };
  }
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (payload === null) return { summary: ":white_check_mark: Done." };
  return { summary: ":white_check_mark: " + JSON.stringify(payload, null, 2) };
}
