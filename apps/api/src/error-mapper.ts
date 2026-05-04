import type { FastifyReply } from "fastify";
import { RpaPlatformError } from "@rpa-platform/shared";

export interface ErrorPayload {
  readonly code: string;
  readonly message: string;
  readonly correlationId: string | undefined;
  readonly details?: Readonly<Record<string, unknown>>;
}

const STATUS_BY_CODE_PREFIX: Record<string, number> = {
  "permission_denied": 403,
  "reconcile.blocked_unconfigured_tenant": 409,
  "config.schema_invalid": 400,
  "credential.not_found": 404,
  "credential.malformed": 500,
  "encryption.key_invalid": 500,
  "encryption.failed": 500,
  "framework.version_invalid": 400,
  "framework.release_not_found": 404,
  "github.webhook_signature_invalid": 401,
  "orchestrator.auth_failed": 401,
  "orchestrator.transport_failed": 502,
  "not_implemented": 501,
};

export function statusFromError(err: unknown): number {
  if (err instanceof RpaPlatformError) {
    if (err.code in STATUS_BY_CODE_PREFIX) {
      return STATUS_BY_CODE_PREFIX[err.code]!;
    }
    if (err.code.startsWith("orchestrator.request_failed.")) {
      const status = Number.parseInt(err.code.split(".").at(-1) ?? "", 10);
      if (Number.isInteger(status) && status >= 400 && status < 600) {
        return status === 404 ? 404 : 502;
      }
    }
    if (err.code.startsWith("github.request_failed")) {
      return 502;
    }
  }
  return 500;
}

export function toPayload(err: unknown): ErrorPayload {
  if (err instanceof RpaPlatformError) {
    return {
      code: err.code,
      message: err.message,
      correlationId: err.correlationId,
      ...(err.details !== undefined && { details: err.details }),
    };
  }
  const message = err instanceof Error ? err.message : "Internal server error";
  return { code: "internal_error", message, correlationId: undefined };
}

export async function sendError(reply: FastifyReply, err: unknown): Promise<void> {
  await reply.code(statusFromError(err)).send(toPayload(err));
}
