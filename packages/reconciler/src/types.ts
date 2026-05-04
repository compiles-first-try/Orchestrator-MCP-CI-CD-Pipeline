import type { Asset, Bucket, Credential, Queue } from "@rpa-platform/config-schema";
import type {
  AssetEntity,
  BucketEntity,
  QueueDefinitionEntity,
} from "@rpa-platform/orchestrator-client";
import type { TenantName } from "@rpa-platform/shared";

export type AuditTransport = "rest" | "rest_fallback" | "mcp";

export type ResourceKind = "asset" | "queue" | "bucket" | "credential" | "config_file";

export type AuditStatus = "planned" | "applied" | "failed" | "skipped";

export interface AuditEvent {
  readonly correlationId: string;
  readonly tenant: TenantName;
  readonly action: "create" | "update" | "delete" | "upload";
  readonly resourceKind: ResourceKind;
  readonly resourceName: string;
  readonly status: AuditStatus;
  readonly transport: AuditTransport;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface AuditSink {
  emit(event: AuditEvent): Promise<void>;
}

export interface ItemDiff<TDesired, TCurrent> {
  readonly creates: readonly TDesired[];
  readonly updates: readonly { readonly current: TCurrent; readonly desired: TDesired }[];
  readonly deletes: readonly TCurrent[];
}

export interface DiffSummary {
  readonly assets: ItemDiff<Asset, AssetEntity>;
  readonly queues: ItemDiff<Queue, QueueDefinitionEntity>;
  readonly buckets: ItemDiff<Bucket, BucketEntity>;
  readonly credentials: ItemDiff<Credential, AssetEntity>;
}

export interface ApplyOutcomeItem {
  readonly resourceKind: ResourceKind;
  readonly resourceName: string;
  readonly action: "create" | "update" | "delete" | "upload";
  readonly status: "applied" | "failed" | "skipped";
  readonly error?: { readonly code: string; readonly message: string };
}

export interface ApplyResult {
  readonly correlationId: string;
  readonly outcomes: readonly ApplyOutcomeItem[];
  readonly stoppedAt: ApplyOutcomeItem | undefined;
}
