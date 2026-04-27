import Fastify, { type FastifyInstance } from "fastify";
import { registerCorrelationHook } from "./correlation.js";
import { healthRoutes } from "./routes/health.js";
import type { AuditWriter } from "./services/audit.js";

export interface AppDeps {
  readonly auditWriter: AuditWriter;
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
  return app;
}

declare module "fastify" {
  interface FastifyInstance {
    auditWriter: AuditWriter;
  }
}
