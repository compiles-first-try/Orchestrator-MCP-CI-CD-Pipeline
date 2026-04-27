import type { ProjectConfig } from "@rpa-platform/config-schema";
import type { CredentialSource } from "@rpa-platform/credential-source";
import type {
  AssetsApi,
  BucketsApi,
  CreateAssetInput,
  CreateBucketInput,
  CreateQueueDefinitionInput,
  QueueDefinitionsApi,
  Transport,
} from "@rpa-platform/orchestrator-client";
import type { TenantName } from "@rpa-platform/shared";

export type TenantStatus = "pending_credentials" | "connected" | "auth_failed";

export interface ReconcileInput {
  readonly projectId: string;
  readonly projectName: string;
  readonly tenant: TenantName;
  readonly tenantStatus: TenantStatus;
  readonly desired: ProjectConfig;
  readonly clients: {
    readonly assets: AssetsApi;
    readonly queueDefinitions: QueueDefinitionsApi;
    readonly buckets: BucketsApi;
  };
  readonly credentialSource: CredentialSource;
  readonly correlationId: string;
}

export type ResourceKind = "asset" | "queue" | "bucket";

export type DiffOperation =
  | {
      readonly action: "create";
      readonly resource: "asset";
      readonly name: string;
      readonly input: CreateAssetInput;
    }
  | {
      readonly action: "update";
      readonly resource: "asset";
      readonly id: number;
      readonly name: string;
      readonly input: CreateAssetInput;
    }
  | {
      readonly action: "delete";
      readonly resource: "asset";
      readonly id: number;
      readonly name: string;
    }
  | {
      readonly action: "create";
      readonly resource: "queue";
      readonly name: string;
      readonly input: CreateQueueDefinitionInput;
    }
  | {
      readonly action: "update";
      readonly resource: "queue";
      readonly id: number;
      readonly name: string;
      readonly input: CreateQueueDefinitionInput;
    }
  | {
      readonly action: "delete";
      readonly resource: "queue";
      readonly id: number;
      readonly name: string;
    }
  | {
      readonly action: "create";
      readonly resource: "bucket";
      readonly name: string;
      readonly input: CreateBucketInput;
    }
  | {
      readonly action: "update";
      readonly resource: "bucket";
      readonly id: number;
      readonly name: string;
      readonly input: CreateBucketInput;
    }
  | {
      readonly action: "delete";
      readonly resource: "bucket";
      readonly id: number;
      readonly name: string;
    };

export interface ResourceSummary {
  readonly creates: number;
  readonly updates: number;
  readonly deletes: number;
  readonly unchanged: number;
}

export interface PlanSummary {
  readonly assets: ResourceSummary;
  readonly queues: ResourceSummary;
  readonly buckets: ResourceSummary;
}

export interface ReconcilePlan {
  readonly operations: readonly DiffOperation[];
  readonly summary: PlanSummary;
}

export interface AppliedOperation {
  readonly operation: DiffOperation;
  readonly transport: Transport;
  readonly success: boolean;
  readonly error: { readonly code: string; readonly message: string } | undefined;
}

export interface ApplyResult {
  readonly applied: readonly AppliedOperation[];
  readonly stoppedAt: number | undefined;
  readonly success: boolean;
}
