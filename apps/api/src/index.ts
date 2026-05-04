// Entry point. Boots the Fastify server with the env-validated
// configuration. Composition of all dependencies (DB pool, Reconciler,
// IdentityResolver, provisioning, tenant-connect) lives here so tests can
// call buildServer() with stubs without touching this file.
import { loadEncryptionKey, SYSTEM_ROLES } from "@rpa-platform/shared";
import {
  ManualCredentialSource,
  buildDefaultRegistry,
} from "@rpa-platform/credential-source";
import { GithubClient } from "@rpa-platform/github-client";
import { OrchestratorClient } from "@rpa-platform/orchestrator-client";
import { ConfigOutputWriter } from "@rpa-platform/config-output";
import { Reconciler } from "@rpa-platform/reconciler";
import { createDatabase } from "@rpa-platform/db";
import {
  CredentialValuesRepo,
  ProjectRepo,
  ProjectTenantRepo,
  UserRepo,
  createDbAuditSink,
} from "./db-adapters/index.js";
import { loadEnv } from "./config.js";
import { createHarvardFuzzyIdentityResolver } from "./identity.js";
import { buildServer } from "./server.js";
import { ProjectProvisioningService } from "./services/project-provisioning.js";
import { TenantConnectService } from "./services/tenant-connect.js";
import type { Role } from "@rpa-platform/shared";

async function main(): Promise<void> {
  const env = loadEnv();
  const encryptionKey = loadEncryptionKey(env.PLATFORM_ENCRYPTION_KEY);

  const { db } = createDatabase({ connectionString: env.DATABASE_URL });

  const projects = new ProjectRepo(db);
  const projectTenants = new ProjectTenantRepo(db);
  const users = new UserRepo(db);

  // The CredentialValuesRepo is a ManualSecretStore; it needs a non-nullable
  // `setByUserId` for inserts. We seed with a "system" user upserted on
  // boot — every actual call to `withActor()` rebinds to the live caller.
  const systemUser = await users.upsertByEmail({
    email: "system@rpa-platform.local",
    displayName: "rpa-platform system",
  });
  const credentialValues = new CredentialValuesRepo(db, systemUser.id);
  const credentials = buildDefaultRegistry(
    new ManualCredentialSource(credentialValues, encryptionKey),
  );

  const orchestrator = new OrchestratorClient({
    baseUrl: env.ORCHESTRATOR_REST_BASE_URL ?? "https://cloud.uipath.com/placeholder/placeholder/orchestrator_",
    tenantConfig: {
      identityTokenUrl: "https://cloud.uipath.com/placeholder/identity_/connect/token",
      clientId: env.DEFAULT_OAUTH_CLIENT_ID ?? "",
      clientSecret: env.DEFAULT_OAUTH_CLIENT_SECRET ?? "",
      scopes: ["OR.Default"],
    },
  });

  const audit = createDbAuditSink(db);
  const configOutput = new ConfigOutputWriter(orchestrator, []);
  const reconciler = new Reconciler(orchestrator, credentials, configOutput, audit);

  const systemRoles: Readonly<Record<"developer" | "admin" | "ba", Role>> = {
    developer: { id: "developer", name: "developer", isSystem: true, permissions: SYSTEM_ROLES.developer },
    admin: { id: "admin", name: "admin", isSystem: true, permissions: SYSTEM_ROLES.admin },
    ba: { id: "ba", name: "ba", isSystem: true, permissions: SYSTEM_ROLES.ba },
  };
  // Default to the Harvard fuzzy resolver per memory: fuzzy_email_match.
  const identity = createHarvardFuzzyIdentityResolver({ orchestrator, systemRoles });

  const provisioning =
    env.GITHUB_PLATFORM_TOKEN !== undefined &&
    env.RPA_TEMPLATE_REPO_OWNER !== undefined &&
    env.RPA_TEMPLATE_REPO_NAME !== undefined
      ? {
          service: new ProjectProvisioningService({
            github: new GithubClient({ token: env.GITHUB_PLATFORM_TOKEN }),
            configOutput,
          }),
          defaultTemplate: {
            owner: env.RPA_TEMPLATE_REPO_OWNER,
            repo: env.RPA_TEMPLATE_REPO_NAME,
          },
          projectRepoOwner: env.RPA_PROJECT_REPO_OWNER ?? env.RPA_TEMPLATE_REPO_OWNER,
          users,
          projects,
        }
      : undefined;

  const tenantConnect = new TenantConnectService({
    projects,
    projectTenants,
    encryptionKey,
  });

  const app = buildServer({
    env,
    reconciler,
    identity,
    ...(provisioning !== undefined && { provisioning }),
    tenantConnect,
  });
  await app.listen({ port: env.API_PORT, host: "0.0.0.0" });
  app.log.info(`rpa-platform API listening on :${env.API_PORT}`);
}

if (process.env.RPA_API_BOOT !== "skip") {
  main().catch((err) => {
    console.error("API boot failed:", err);
    process.exit(1);
  });
}
