import { type Database, auditLog } from "@rpa-platform/db";
import type { AuditEvent, AuditSink } from "@rpa-platform/reconciler";

// Maps the reconciler's AuditEvent shape onto the audit_log table. The
// transport enum on the table includes 'mcp' / 'rest_fallback' / 'n_a';
// our reconciler emits 'rest' (internal label) which we translate to
// 'rest_fallback' (the column's enum value, kept for forward compat with
// the v2 MCP automation-trigger feature).
const TRANSPORT_BY_LABEL: Record<AuditEvent["transport"], "mcp" | "rest_fallback" | "n_a"> = {
  mcp: "mcp",
  rest: "rest_fallback",
  rest_fallback: "rest_fallback",
};

export interface DbAuditSinkOptions {
  // Maps Slack/Orchestrator user IDs to our local users.id when an event
  // belongs to a specific actor. Optional — for system events (cron jobs,
  // token refresh) this stays undefined.
  resolveActorId?(event: AuditEvent): string | undefined;
}

export function createDbAuditSink(db: Database, options: DbAuditSinkOptions = {}): AuditSink {
  return {
    async emit(event) {
      const actorId = options.resolveActorId?.(event);
      const errorString = event.status === "failed" ? extractErrorString(event.details) : undefined;
      await db.insert(auditLog).values({
        action: `${event.action}.${event.resourceKind}`,
        targetType: event.resourceKind,
        targetId: event.resourceName,
        success: event.status === "applied" || event.status === "skipped",
        ...(errorString !== undefined && { error: errorString }),
        correlationId: event.correlationId,
        transport: TRANSPORT_BY_LABEL[event.transport],
        ...(actorId !== undefined && { actorUserId: actorId }),
        ...(event.details !== undefined && { after: event.details }),
      });
    },
  };
}

function extractErrorString(details: unknown): string | undefined {
  if (details === undefined || details === null || typeof details !== "object") return undefined;
  const obj = details as Record<string, unknown>;
  const message = obj["message"];
  if (typeof message === "string") return message;
  return JSON.stringify(details);
}
