import Fastify, { type FastifyInstance } from "fastify";
import type { Reconciler } from "@rpa-platform/reconciler";
import type { AppEnv } from "./config.js";
import { registerCorrelationId } from "./correlation.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerProjectsRoutes } from "./routes/projects.js";
import { registerReconcileRoutes } from "./routes/reconcile.js";
import { registerTenantRoutes } from "./routes/tenants.js";
import { registerWebhookRoutes } from "./routes/webhooks.js";
import { sendError } from "./error-mapper.js";
import type { IdentityResolver } from "./identity.js";
import type { ProjectProvisioningService, TemplateRef } from "./services/project-provisioning.js";
import type { TenantConnectService } from "./services/tenant-connect.js";
import type { ProjectRepo } from "./db-adapters/projects.js";
import type { UserRepo } from "./db-adapters/users.js";

export interface ServerDeps {
  readonly env: AppEnv;
  readonly reconciler: Reconciler;
  readonly identity: IdentityResolver;
  // Optional — when omitted, the /projects endpoint is not registered.
  readonly provisioning?: {
    readonly service: ProjectProvisioningService;
    readonly defaultTemplate: TemplateRef;
    readonly projectRepoOwner: string;
    // Repos used by /projects to register the new project in the platform
    // DB *after* the GitHub repo is created. Required so subsequent
    // `/rpa tenant connect <project>` calls can find the project by name.
    readonly users: UserRepo;
    readonly projects: ProjectRepo;
  };
  // Optional — when omitted the /tenants/connect endpoint is not registered.
  readonly tenantConnect?: TenantConnectService;
}

export function buildServer(deps: ServerDeps): FastifyInstance {
  const app = Fastify({
    logger: { level: deps.env.LOG_LEVEL },
    disableRequestLogging: false,
  });

  registerCorrelationId(app);
  registerHealthRoutes(app);
  registerReconcileRoutes(app, { reconciler: deps.reconciler, identity: deps.identity });
  registerWebhookRoutes(app, { githubWebhookSecret: deps.env.GITHUB_WEBHOOK_SECRET });
  if (deps.provisioning !== undefined) {
    registerProjectsRoutes(app, {
      identity: deps.identity,
      provisioning: deps.provisioning.service,
      defaultTemplate: deps.provisioning.defaultTemplate,
      projectRepoOwner: deps.provisioning.projectRepoOwner,
      users: deps.provisioning.users,
      projects: deps.provisioning.projects,
    });
  }
  if (deps.tenantConnect !== undefined) {
    registerTenantRoutes(app, {
      identity: deps.identity,
      tenantConnect: deps.tenantConnect,
    });
  }

  app.setErrorHandler(async (err, _request, reply) => {
    await sendError(reply, err);
  });

  return app;
}
