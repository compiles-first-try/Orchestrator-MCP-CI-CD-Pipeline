import { z } from "zod";

// All env vars accepted by the API server. Validated up-front at boot so
// missing/malformed config fails before any request is handled.
const Env = z.object({
  DATABASE_URL: z.string().min(1),
  PLATFORM_ENCRYPTION_KEY: z.string().min(1),
  ORCHESTRATOR_MCP_URL: z.string().min(1).optional(),
  ORCHESTRATOR_REST_BASE_URL: z.string().min(1).optional(),
  DEFAULT_OAUTH_CLIENT_ID: z.string().optional(),
  DEFAULT_OAUTH_CLIENT_SECRET: z.string().optional(),
  SLACK_BOT_TOKEN: z.string().optional(),
  SLACK_APP_TOKEN: z.string().optional(),
  SLACK_SIGNING_SECRET: z.string().optional(),
  GITHUB_APP_ID: z.string().optional(),
  GITHUB_APP_PRIVATE_KEY: z.string().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().optional(),
  // GitHub token for the platform's own operations (creating repos from
  // template, opening PRs on behalf of /rpa config set, etc.). Either a
  // GitHub App installation token (preferred) or a classic PAT.
  GITHUB_PLATFORM_TOKEN: z.string().optional(),
  // Configurable framework / new-project template repo. The user's existing
  // REFramework template repo is admin-managed and may be renamed or moved;
  // we read it from env so a single config change propagates to every new
  // project provision flow.
  RPA_TEMPLATE_REPO_OWNER: z.string().min(1).optional(),
  RPA_TEMPLATE_REPO_NAME: z.string().min(1).optional(),
  // The GitHub org or user under which newly-provisioned project repos are
  // created. Defaults to the same owner as the template.
  RPA_PROJECT_REPO_OWNER: z.string().min(1).optional(),
  API_PORT: z
    .string()
    .default("3000")
    .transform((v) => Number.parseInt(v, 10))
    .pipe(z.number().int().positive()),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

export type AppEnv = z.infer<typeof Env>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const parsed = Env.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
