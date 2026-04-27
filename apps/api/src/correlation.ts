import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";

export const CORRELATION_HEADER = "x-correlation-id";

export function registerCorrelationHook(app: FastifyInstance): void {
  app.addHook("onRequest", async (request, reply) => {
    const incoming = request.headers[CORRELATION_HEADER];
    const correlationId =
      typeof incoming === "string" && incoming.length > 0 ? incoming : randomUUID();
    request.correlationId = correlationId;
    reply.header(CORRELATION_HEADER, correlationId);
  });
}

declare module "fastify" {
  interface FastifyRequest {
    correlationId: string;
  }
}
