import { parseApiEnv } from "./config.js";
import { createApp } from "./server.js";
import { InMemoryAuditWriter } from "./services/audit.js";

async function main(): Promise<void> {
  const env = parseApiEnv();
  // TODO(api-bootstrap): swap InMemoryAuditWriter for DrizzleAuditWriter once
  // DATABASE_URL wiring is finalized in infra/. The in-memory writer keeps
  // the dev server runnable without Postgres.
  const auditWriter = new InMemoryAuditWriter();
  const app = await createApp({ auditWriter, logLevel: env.LOG_LEVEL });
  await app.listen({ port: env.PORT, host: env.HOST });
}

main().catch((err: unknown) => {
  process.stderr.write(`api failed to start: ${describe(err)}\n`);
  process.exit(1);
});

function describe(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
