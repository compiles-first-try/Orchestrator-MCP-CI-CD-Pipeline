import type { auditLog, Database, NewAuditLogRow } from "@rpa-platform/db";
import type { TenantName } from "@rpa-platform/shared";

export type AuditTransport = "mcp" | "rest_fallback" | "n_a";

export interface AuditEntry {
  readonly action: string;
  readonly actorUserId?: string;
  readonly targetType?: string;
  readonly targetId?: string;
  readonly before?: unknown;
  readonly after?: unknown;
  readonly success: boolean;
  readonly error?: string;
  readonly correlationId: string;
  readonly transport?: AuditTransport;
  readonly tenant?: TenantName;
}

export interface AuditWriter {
  write(entry: AuditEntry): Promise<void>;
}

export interface DrizzleAuditWriterConfig {
  readonly db: Database;
  readonly table: typeof auditLog;
}

export class DrizzleAuditWriter implements AuditWriter {
  constructor(private readonly config: DrizzleAuditWriterConfig) {}

  async write(entry: AuditEntry): Promise<void> {
    const row: NewAuditLogRow = {
      action: entry.action,
      success: entry.success,
      correlationId: entry.correlationId,
      transport: entry.transport ?? "n_a",
      ...(entry.actorUserId !== undefined ? { actorUserId: entry.actorUserId } : {}),
      ...(entry.targetType !== undefined ? { targetType: entry.targetType } : {}),
      ...(entry.targetId !== undefined ? { targetId: entry.targetId } : {}),
      ...(entry.before !== undefined ? { before: entry.before as object } : {}),
      ...(entry.after !== undefined ? { after: entry.after as object } : {}),
      ...(entry.error !== undefined ? { error: entry.error } : {}),
    };
    await this.config.db.insert(this.config.table).values(row);
  }
}

export class InMemoryAuditWriter implements AuditWriter {
  public readonly entries: AuditEntry[] = [];
  async write(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
  }
}
