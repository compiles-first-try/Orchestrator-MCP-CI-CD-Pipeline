import { createDatabase } from "@rpa-platform/db";
import { createCredentialSource } from "@rpa-platform/credential-source";
import { OctokitGitHubApi } from "@rpa-platform/github-client";
import { parseEncryptionKey } from "@rpa-platform/shared";
import { parseApiEnv } from "./config.js";
import { createApp } from "./server.js";
import { DrizzleAuditWriter, InMemoryAuditWriter, type AuditWriter } from "./services/audit.js";
import { DrizzleProjectLookup } from "./services/project-lookup.js";
import { createReconcileRunners } from "./services/reconcile-runner.js";
import { auditLog } from "@rpa-platform/db";
import { TestAuthenticator } from "./auth.js";
import type { UserWithRoles } from "@rpa-platform/shared";

async function main(): Promise<void> {
  const env = parseApiEnv();

  let auditWriter: AuditWriter = new InMemoryAuditWriter();
  let dbCleanup: (() => Promise<void>) | undefined;

  if (env.DATABASE_URL !== undefined && env.RPA_PLATFORM_ENCRYPTION_KEY !== undefined) {
    const { db, close } = createDatabase({ connectionString: env.DATABASE_URL });
    dbCleanup = close;
    auditWriter = new DrizzleAuditWriter({ db, table: auditLog });

    const githubToken = process.env["GITHUB_TOKEN"];
    if (githubToken !== undefined && githubToken.length > 0) {
      const encryptionKey = parseEncryptionKey(env.RPA_PLATFORM_ENCRYPTION_KEY);
      const projects = new DrizzleProjectLookup(db);
      const credentialSource = createCredentialSource({
        type: "manual",
        config: { db, encryptionKey },
      });
      const github = new OctokitGitHubApi({ authToken: githubToken });
      const runners = createReconcileRunners({
        projects,
        github,
        credentialSource,
        auditWriter,
        encryptionKey,
        identityTokenUrl: () =>
          process.env["UIPATH_IDENTITY_TOKEN_URL"] ??
          "https://cloud.uipath.com/identity_/connect/token",
      });
      // TODO(api-bootstrap): replace TestAuthenticator with HmacAuthenticator
      // once the GitHub Action shared-secret HMAC + Slack signing-secret
      // verifiers land. For now the dev stack runs with the test path so
      // sim:commit can exercise the full pipeline locally.
      const authenticator = new TestAuthenticator(new Map<string, UserWithRoles>());
      const app = await createApp({
        auditWriter,
        logLevel: env.LOG_LEVEL,
        reconcile: {
          authenticator,
          runDryRun: runners.runDryRun,
          runApply: runners.runApply,
        },
      });
      await app.listen({ port: env.PORT, host: env.HOST });
      registerShutdown(app, dbCleanup);
      return;
    }
  }

  // Reduced-functionality startup: no DB / no GitHub. Useful for the very
  // first `docker compose up` before infra/seed has been run, and for
  // development iterations on the routes themselves.
  const app = await createApp({ auditWriter, logLevel: env.LOG_LEVEL });
  await app.listen({ port: env.PORT, host: env.HOST });
  registerShutdown(app, dbCleanup);
}

function registerShutdown(
  app: { close: () => Promise<void> },
  dbCleanup: (() => Promise<void>) | undefined,
): void {
  const shutdown = async (): Promise<void> => {
    await app.close();
    if (dbCleanup !== undefined) await dbCleanup();
    process.exit(0);
  };
  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });
}

main().catch((err: unknown) => {
  process.stderr.write(`api failed to start: ${describe(err)}\n`);
  process.exit(1);
});

function describe(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
