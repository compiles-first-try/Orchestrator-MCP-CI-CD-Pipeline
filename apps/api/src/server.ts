import Fastify, { type FastifyInstance } from "fastify";
import { registerCorrelationHook } from "./correlation.js";
import { healthRoutes } from "./routes/health.js";
import { reconcileRoutes, type ReconcileRoutesDeps } from "./routes/reconcile.js";
import type { AuditWriter } from "./services/audit.js";

export interface AppDeps {
  readonly auditWriter: AuditWriter;
  readonly reconcile?: ReconcileRoutesDeps;
  readonly logLevel?: "fatal" | "error" | "warn" | "info" | "debug" | "trace";
}

export async function createApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: deps.logLevel ?? "info" },
    disableRequestLogging: false,
  });
  app.decorate("auditWriter", deps.auditWriter);
  registerCorrelationHook(app);
  await app.register(healthRoutes);
  if (deps.reconcile !== undefined) {
    await app.register(reconcileRoutes(deps.reconcile), { prefix: "/reconcile" });
  }
  return app;
}

declare module "fastify" {
  interface FastifyInstance {
    auditWriter: AuditWriter;
  }
}
