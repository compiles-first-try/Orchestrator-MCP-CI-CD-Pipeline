import type { Asset, Credential, Queue, Bucket } from "@rpa-platform/config-schema";
import type { ConfigOutputWriter, ResolveInput, ResolvedConfig } from "@rpa-platform/config-output";
import type { CredentialSourceRegistry } from "@rpa-platform/credential-source";
import type {
  AssetCreateInput,
  AssetEntity,
  BucketCreateInput,
  BucketEntity,
  OrchestratorClient,
  QueueCreateInput,
  QueueDefinitionEntity,
} from "@rpa-platform/orchestrator-client";
import { TenantNotConnectedError, type TenantName } from "@rpa-platform/shared";
import {
  assetsEqual,
  bucketsEqual,
  credentialsEqualAssetShell,
  diffByName,
  queuesEqual,
  typeNameForAsset,
} from "./diff.js";
import type {
  ApplyOutcomeItem,
  ApplyResult,
  AuditSink,
  DiffSummary,
} from "./types.js";

export interface ReconcileInput {
  readonly tenant: TenantName;
  readonly tenantStatus: "connected" | "pending_credentials" | "auth_failed";
  readonly project: { readonly name: string };
  readonly configs: ResolveInput;
  readonly pinnedFrameworkVersion: string;
  readonly bucketIdForConfig: number;
  readonly folderId: string | number;
  // Whether the reconciler is allowed to apply *deletes* against
  // Orchestrator on this run. Computed by the route layer from the matrix
  // (memory: tiered_delete_policy):
  //   • developer + tenant=dev → true
  //   • admin + tenant=dev/test/stage → true
  //   • ba + tenant=stage → true
  //   • everyone + tenant=prod → false (Orchestrator UI only)
  // When false, the diff still reports what *would* be deleted but the
  // reconciler skips them with an audit reason. Default false for safety.
  readonly allowDeletes?: boolean;
}

export interface ReconcileDryRunResult {
  readonly resolved: ResolvedConfig;
  readonly diff: DiffSummary;
}

export class Reconciler {
  readonly #orchestrator: OrchestratorClient;
  readonly #credentials: CredentialSourceRegistry;
  readonly #configOutput: ConfigOutputWriter;
  readonly #audit: AuditSink;

  constructor(
    orchestrator: OrchestratorClient,
    credentials: CredentialSourceRegistry,
    configOutput: ConfigOutputWriter,
    audit: AuditSink,
  ) {
    this.#orchestrator = orchestrator;
    this.#credentials = credentials;
    this.#configOutput = configOutput;
    this.#audit = audit;
  }

  async dryRun(input: ReconcileInput): Promise<ReconcileDryRunResult> {
    this.#assertTenantConnected(input);
    const resolved = this.#configOutput.resolve(input.configs);
    const diff = await this.#computeDiff(resolved, input);
    return { resolved, diff };
  }

  async apply(input: ReconcileInput, correlationId: string): Promise<ApplyResult> {
    this.#assertTenantConnected(input);
    const resolved = this.#configOutput.resolve(input.configs);
    const diff = await this.#computeDiff(resolved, input);
    const folder = { folderId: input.folderId };
    const outcomes: ApplyOutcomeItem[] = [];

    // Order: creates → updates → deletes. Whether deletes actually run is
    // controlled by `input.allowDeletes` — the route layer (which knows the
    // caller) computes it from the matrix per the tiered policy
    // (memory: tiered_delete_policy). When false, deletes still appear in
    // the dry-run diff but apply skips them with an audit reason.
    const allowDeletes = input.allowDeletes === true;
    const planned = [
      ...this.#planCreates(diff),
      ...this.#planUpdates(diff),
      ...(allowDeletes ? this.#planDeletes(diff) : []),
    ];

    // Audit the deletes the platform deliberately did NOT apply. We do
    // this BEFORE the planned ops run so the audit trail's ordering
    // reflects the decision sequence, not just the wire calls.
    if (!allowDeletes) {
      for (const skipped of this.#enumerateSkippedDeletes(diff)) {
        outcomes.push({
          resourceKind: skipped.resourceKind,
          resourceName: skipped.resourceName,
          action: "delete",
          status: "skipped",
        });
        await this.#audit.emit({
          correlationId,
          tenant: input.tenant,
          action: "delete",
          resourceKind: skipped.resourceKind,
          resourceName: skipped.resourceName,
          status: "skipped",
          transport: "rest_fallback",
          details: { reason: "caller_lacks_delete_permission_or_prod_locked" },
        });
      }
    }

    for (const step of planned) {
      try {
        await step.run(this, folder);
        const outcome: ApplyOutcomeItem = {
          resourceKind: step.resourceKind,
          resourceName: step.resourceName,
          action: step.action,
          status: "applied",
        };
        outcomes.push(outcome);
        await this.#audit.emit({
          correlationId,
          tenant: input.tenant,
          action: step.action,
          resourceKind: step.resourceKind,
          resourceName: step.resourceName,
          status: "applied",
          transport: "rest_fallback",
        });
      } catch (err) {
        const error = toErrorRecord(err);
        const outcome: ApplyOutcomeItem = {
          resourceKind: step.resourceKind,
          resourceName: step.resourceName,
          action: step.action,
          status: "failed",
          error,
        };
        outcomes.push(outcome);
        await this.#audit.emit({
          correlationId,
          tenant: input.tenant,
          action: step.action,
          resourceKind: step.resourceKind,
          resourceName: step.resourceName,
          status: "failed",
          transport: "rest_fallback",
          details: error,
        });
        return { correlationId, outcomes, stoppedAt: outcome };
      }
    }

    // After Orchestrator-side ops succeed, write Config.json (and Excel if
    // legacy) to the project's bucket. This is its own audited step.
    try {
      const result = await this.#configOutput.writeToBucket(
        input.configs,
        input.pinnedFrameworkVersion,
        { bucketId: input.bucketIdForConfig, folderId: input.folderId },
      );
      const outcome: ApplyOutcomeItem = {
        resourceKind: "config_file",
        resourceName: "Config.json",
        action: "upload",
        status: "applied",
      };
      outcomes.push(outcome);
      await this.#audit.emit({
        correlationId,
        tenant: input.tenant,
        action: "upload",
        resourceKind: "config_file",
        resourceName: "Config.json",
        status: "applied",
        transport: "rest_fallback",
        details: { wroteLegacyExcel: result.wroteLegacyExcel },
      });
    } catch (err) {
      const error = toErrorRecord(err);
      const outcome: ApplyOutcomeItem = {
        resourceKind: "config_file",
        resourceName: "Config.json",
        action: "upload",
        status: "failed",
        error,
      };
      outcomes.push(outcome);
      await this.#audit.emit({
        correlationId,
        tenant: input.tenant,
        action: "upload",
        resourceKind: "config_file",
        resourceName: "Config.json",
        status: "failed",
        transport: "rest_fallback",
        details: error,
      });
      return { correlationId, outcomes, stoppedAt: outcome };
    }

    return { correlationId, outcomes, stoppedAt: undefined };
  }

  #assertTenantConnected(input: ReconcileInput): void {
    if (input.tenantStatus !== "connected") {
      throw new TenantNotConnectedError(input.tenant, input.project.name);
    }
  }

  async #computeDiff(resolved: ResolvedConfig, input: ReconcileInput): Promise<DiffSummary> {
    const folder = { folderId: input.folderId };
    const [currentAssets, currentQueues, currentBuckets] = await Promise.all([
      this.#orchestrator.assets.list({ folder }),
      this.#orchestrator.queues.list({ folder }),
      this.#orchestrator.buckets.list({ folder }),
    ]);

    // Credentials live inside the Assets collection (ValueType=Credential).
    // Split current Assets between regular assets and credential shells.
    const currentNonCredentialAssets: AssetEntity[] = [];
    const currentCredentialAssets: AssetEntity[] = [];
    for (const a of currentAssets) {
      (a.ValueType === "Credential" ? currentCredentialAssets : currentNonCredentialAssets).push(a);
    }

    return {
      assets: diffByName(resolved.assets, currentNonCredentialAssets, assetsEqual),
      queues: diffByName(resolved.queues, currentQueues, queuesEqual),
      buckets: diffByName(resolved.buckets, currentBuckets, bucketsEqual),
      credentials: diffByName(resolved.credentials, currentCredentialAssets, credentialsEqualAssetShell),
    };
  }

  #planCreates(diff: DiffSummary): ApplyStep[] {
    const steps: ApplyStep[] = [];
    for (const a of diff.assets.creates) steps.push(makeAssetCreate(a));
    for (const q of diff.queues.creates) steps.push(makeQueueCreate(q));
    for (const b of diff.buckets.creates) steps.push(makeBucketCreate(b));
    for (const c of diff.credentials.creates) steps.push(makeCredentialCreate(c));
    return steps;
  }

  #planUpdates(diff: DiffSummary): ApplyStep[] {
    const steps: ApplyStep[] = [];
    for (const u of diff.assets.updates) steps.push(makeAssetUpdate(u.current.Id, u.desired));
    for (const u of diff.queues.updates) steps.push(makeQueueUpdate(u.current.Id, u.desired));
    for (const u of diff.buckets.updates) steps.push(makeBucketUpdate(u.current.Id, u.desired));
    for (const u of diff.credentials.updates) steps.push(makeCredentialUpdate(u.current.Id, u.desired));
    return steps;
  }

  // Active when input.allowDeletes is true (per the tiered_delete_policy
  // memory). Order is intentional: credentials first, then regular assets,
  // then queues/buckets. Credentials before assets because both live in
  // the Assets collection but credentials hold secret material — clearing
  // those out first reduces the window where stale secrets could be read.
  #planDeletes(diff: DiffSummary): ApplyStep[] {
    const steps: ApplyStep[] = [];
    for (const c of diff.credentials.deletes) steps.push(makeAssetDelete(c, "credential"));
    for (const a of diff.assets.deletes) steps.push(makeAssetDelete(a, "asset"));
    for (const q of diff.queues.deletes) steps.push(makeQueueDelete(q));
    for (const b of diff.buckets.deletes) steps.push(makeBucketDelete(b));
    return steps;
  }

  *#enumerateSkippedDeletes(diff: DiffSummary): Iterable<{
    readonly resourceKind: "asset" | "queue" | "bucket" | "credential";
    readonly resourceName: string;
  }> {
    for (const c of diff.credentials.deletes) yield { resourceKind: "credential", resourceName: c.Name };
    for (const a of diff.assets.deletes) yield { resourceKind: "asset", resourceName: a.Name };
    for (const q of diff.queues.deletes) yield { resourceKind: "queue", resourceName: q.Name };
    for (const b of diff.buckets.deletes) yield { resourceKind: "bucket", resourceName: b.Name };
  }

  // Internal accessors for ApplyStep callbacks.
  get _orchestrator(): OrchestratorClient {
    return this.#orchestrator;
  }
  get _credentials(): CredentialSourceRegistry {
    return this.#credentials;
  }
}

interface ApplyStep {
  readonly resourceKind: "asset" | "queue" | "bucket" | "credential";
  readonly resourceName: string;
  readonly action: "create" | "update" | "delete";
  run(reconciler: Reconciler, folder: { folderId: string | number }): Promise<void>;
}

function assetCreateInput(asset: Asset): AssetCreateInput {
  const valueType = typeNameForAsset(asset);
  switch (asset.type) {
    case "text":
      return {
        Name: asset.name,
        ValueType: valueType,
        StringValue: asset.value,
        ...(asset.description !== undefined && { Description: asset.description }),
      };
    case "bool":
      return {
        Name: asset.name,
        ValueType: valueType,
        BoolValue: asset.value,
        ...(asset.description !== undefined && { Description: asset.description }),
      };
    case "integer":
      return {
        Name: asset.name,
        ValueType: valueType,
        IntValue: asset.value,
        ...(asset.description !== undefined && { Description: asset.description }),
      };
    default:
      return { Name: asset.name, ValueType: valueType };
  }
}

function makeAssetCreate(asset: Asset): ApplyStep {
  return {
    resourceKind: "asset",
    resourceName: asset.name,
    action: "create",
    async run(reconciler, folder) {
      await reconciler._orchestrator.assets.create(assetCreateInput(asset), { folder });
    },
  };
}

function makeAssetUpdate(id: number, asset: Asset): ApplyStep {
  return {
    resourceKind: "asset",
    resourceName: asset.name,
    action: "update",
    async run(reconciler, folder) {
      const { Name: _ignored, ValueType: _ignored2, ...rest } = assetCreateInput(asset);
      await reconciler._orchestrator.assets.update(id, rest, { folder });
    },
  };
}

function queueCreateInput(queue: Queue): QueueCreateInput {
  return {
    Name: queue.name,
    ...(queue.description !== undefined && { Description: queue.description }),
    AcceptAutomaticallyRetry: queue.autoRetry,
    MaxNumberOfRetries: queue.maxRetries,
    EnforceUniqueReference: queue.uniqueReference,
    Encrypted: queue.encrypted,
  };
}

function makeQueueCreate(queue: Queue): ApplyStep {
  return {
    resourceKind: "queue",
    resourceName: queue.name,
    action: "create",
    async run(reconciler, folder) {
      await reconciler._orchestrator.queues.create(queueCreateInput(queue), { folder });
    },
  };
}

function makeQueueUpdate(id: number, queue: Queue): ApplyStep {
  return {
    resourceKind: "queue",
    resourceName: queue.name,
    action: "update",
    async run(reconciler, folder) {
      const { Name: _ignored, ...rest } = queueCreateInput(queue);
      await reconciler._orchestrator.queues.update(id, rest, { folder });
    },
  };
}

function bucketCreateInput(bucket: Bucket): BucketCreateInput {
  return {
    Name: bucket.name,
    ...(bucket.description !== undefined && { Description: bucket.description }),
    ...(bucket.provider !== undefined && { StorageProvider: bucket.provider }),
    ...(bucket.externalName !== undefined && { ExternalName: bucket.externalName }),
    ...(bucket.storageParameters !== undefined && {
      StorageParameters: JSON.stringify(bucket.storageParameters),
    }),
  };
}

function makeBucketCreate(bucket: Bucket): ApplyStep {
  return {
    resourceKind: "bucket",
    resourceName: bucket.name,
    action: "create",
    async run(reconciler, folder) {
      await reconciler._orchestrator.buckets.create(bucketCreateInput(bucket), { folder });
    },
  };
}

function makeBucketUpdate(id: number, bucket: Bucket): ApplyStep {
  return {
    resourceKind: "bucket",
    resourceName: bucket.name,
    action: "update",
    async run(reconciler, folder) {
      const { Name: _ignored, ...rest } = bucketCreateInput(bucket);
      await reconciler._orchestrator.buckets.update(id, rest, { folder });
    },
  };
}

// Delete helpers — only ever scheduled when ReconcileInput.allowDeletes is
// true. The route layer guards this by checking the RECONCILE_DELETE matrix
// permission for the tenant and the Orchestrator-side capability before
// passing the flag.

function makeAssetDelete(entity: AssetEntity, kind: "asset" | "credential"): ApplyStep {
  return {
    resourceKind: kind,
    resourceName: entity.Name,
    action: "delete",
    async run(reconciler, folder) {
      await reconciler._orchestrator.assets.delete(entity.Id, { folder });
    },
  };
}

function makeQueueDelete(entity: QueueDefinitionEntity): ApplyStep {
  return {
    resourceKind: "queue",
    resourceName: entity.Name,
    action: "delete",
    async run(reconciler, folder) {
      await reconciler._orchestrator.queues.delete(entity.Id, { folder });
    },
  };
}

function makeBucketDelete(entity: BucketEntity): ApplyStep {
  return {
    resourceKind: "bucket",
    resourceName: entity.Name,
    action: "delete",
    async run(reconciler, folder) {
      await reconciler._orchestrator.buckets.delete(entity.Id, { folder });
    },
  };
}

function makeCredentialCreate(credential: Credential): ApplyStep {
  return {
    resourceKind: "credential",
    resourceName: credential.name,
    action: "create",
    async run(reconciler, folder) {
      const source = reconciler._credentials.get(credential.secretSource);
      if (source === undefined) {
        throw new Error(`No credential-source registered for kind '${credential.secretSource}'`);
      }
      const value = await source.resolve(credential.secretRef);
      await reconciler._orchestrator.assets.create(
        {
          Name: credential.name,
          ValueType: "Credential",
          ...(credential.description !== undefined && { Description: credential.description }),
          ...(value.username !== undefined && { CredentialUsername: value.username }),
          CredentialPassword: value.password,
        },
        { folder },
      );
    },
  };
}

function makeCredentialUpdate(id: number, credential: Credential): ApplyStep {
  return {
    resourceKind: "credential",
    resourceName: credential.name,
    action: "update",
    async run(reconciler, folder) {
      const source = reconciler._credentials.get(credential.secretSource);
      if (source === undefined) {
        throw new Error(`No credential-source registered for kind '${credential.secretSource}'`);
      }
      const value = await source.resolve(credential.secretRef);
      await reconciler._orchestrator.assets.update(
        id,
        {
          ...(credential.description !== undefined && { Description: credential.description }),
          ...(value.username !== undefined && { CredentialUsername: value.username }),
          CredentialPassword: value.password,
        },
        { folder },
      );
    },
  };
}

function toErrorRecord(err: unknown): { code: string; message: string } {
  const code =
    (err as { code?: string }).code ??
    ((err as { name?: string }).name ?? "error");
  const message = (err as Error).message ?? String(err);
  return { code, message };
}
