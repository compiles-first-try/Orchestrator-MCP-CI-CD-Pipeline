import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";

declare module "fastify" {
  interface FastifyRequest {
    correlationId: string;
  }
}

export function registerCorrelationId(app: FastifyInstance): void {
  app.addHook("onRequest", async (request) => {
    const fromHeader = request.headers["x-correlation-id"];
    request.correlationId = typeof fromHeader === "string" && fromHeader.length > 0
      ? fromHeader
      : randomUUID();
  });
  app.addHook("onSend", async (request, reply, payload) => {
    reply.header("x-correlation-id", request.correlationId);
    return payload;
  });
}

export function correlationIdFor(request: FastifyRequest): string {
  return request.correlationId;
}
