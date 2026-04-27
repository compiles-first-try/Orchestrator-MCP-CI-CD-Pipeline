import type {
  Asset as ConfigAsset,
  Bucket as ConfigBucket,
  Queue as ConfigQueue,
  Overrides,
} from "@rpa-platform/config-schema";
import type {
  Asset,
  AssetScope,
  Bucket,
  BucketStorageProvider,
  CreateAssetInput,
  CreateBucketInput,
  CreateQueueDefinitionInput,
  QueueDefinition,
} from "@rpa-platform/orchestrator-client";
import type {
  DiffOperation,
  PlanSummary,
  ReconcileInput,
  ReconcilePlan,
  ResourceSummary,
} from "./types.js";
import { TenantNotConnectedError } from "@rpa-platform/shared";

export async function planReconcile(input: ReconcileInput): Promise<ReconcilePlan> {
  if (input.tenantStatus !== "connected") {
    throw new TenantNotConnectedError(input.tenant, input.projectName, {
      correlationId: input.correlationId,
    });
  }

  const [currentAssets, currentQueues, currentBuckets] = await Promise.all([
    input.clients.assets.list(),
    input.clients.queueDefinitions.list(),
    input.clients.buckets.list(),
  ]);

  const assetOps = diffAssets(input.desired.assets, input.desired.overrides, currentAssets.data);
  const queueOps = diffQueues(input.desired.queues, currentQueues.data);
  const bucketOps = diffBuckets(input.desired.buckets, currentBuckets.data);

  const operations: DiffOperation[] = [
    ...orderByAction(assetOps),
    ...orderByAction(queueOps),
    ...orderByAction(bucketOps),
  ];

  const summary: PlanSummary = {
    assets: summarize(assetOps, input.desired.assets.length, currentAssets.data.length),
    queues: summarize(queueOps, input.desired.queues.length, currentQueues.data.length),
    buckets: summarize(bucketOps, input.desired.buckets.length, currentBuckets.data.length),
  };

  return { operations, summary };
}

function diffAssets(
  desired: readonly ConfigAsset[],
  overrides: Overrides,
  current: readonly Asset[],
): readonly DiffOperation[] {
  const desiredByName = new Map<string, CreateAssetInput>();
  for (const asset of desired) {
    desiredByName.set(asset.name, toAssetInput(asset, overrides));
  }
  const currentByName = new Map(current.map((a) => [a.name, a]));
  const ops: DiffOperation[] = [];
  for (const [name, input] of desiredByName) {
    const existing = currentByName.get(name);
    if (existing === undefined) {
      ops.push({ action: "create", resource: "asset", name, input });
      continue;
    }
    if (assetDiffers(existing, input)) {
      ops.push({ action: "update", resource: "asset", id: existing.id, name, input });
    }
  }
  for (const [name, asset] of currentByName) {
    if (desiredByName.has(name) === false) {
      ops.push({ action: "delete", resource: "asset", id: asset.id, name });
    }
  }
  return ops;
}

function diffQueues(
  desired: readonly ConfigQueue[],
  current: readonly QueueDefinition[],
): readonly DiffOperation[] {
  const desiredByName = new Map<string, CreateQueueDefinitionInput>();
  for (const queue of desired) {
    desiredByName.set(queue.name, toQueueInput(queue));
  }
  const currentByName = new Map(current.map((q) => [q.name, q]));
  const ops: DiffOperation[] = [];
  for (const [name, input] of desiredByName) {
    const existing = currentByName.get(name);
    if (existing === undefined) {
      ops.push({ action: "create", resource: "queue", name, input });
      continue;
    }
    if (queueDiffers(existing, input)) {
      ops.push({ action: "update", resource: "queue", id: existing.id, name, input });
    }
  }
  for (const [name, queue] of currentByName) {
    if (desiredByName.has(name) === false) {
      ops.push({ action: "delete", resource: "queue", id: queue.id, name });
    }
  }
  return ops;
}

function diffBuckets(
  desired: readonly ConfigBucket[],
  current: readonly Bucket[],
): readonly DiffOperation[] {
  const desiredByName = new Map<string, CreateBucketInput>();
  for (const bucket of desired) {
    desiredByName.set(bucket.name, toBucketInput(bucket));
  }
  const currentByName = new Map(current.map((b) => [b.name, b]));
  const ops: DiffOperation[] = [];
  for (const [name, input] of desiredByName) {
    const existing = currentByName.get(name);
    if (existing === undefined) {
      ops.push({ action: "create", resource: "bucket", name, input });
      continue;
    }
    if (bucketDiffers(existing, input)) {
      ops.push({ action: "update", resource: "bucket", id: existing.id, name, input });
    }
  }
  for (const [name, bucket] of currentByName) {
    if (desiredByName.has(name) === false) {
      ops.push({ action: "delete", resource: "bucket", id: bucket.id, name });
    }
  }
  return ops;
}

function toAssetInput(asset: ConfigAsset, overrides: Overrides): CreateAssetInput {
  const overrideValue = overrides.assets?.[asset.name]?.value;
  const scope = mapScope(asset.scope);
  const description = asset.description;
  switch (asset.type) {
    case "text": {
      const value = typeof overrideValue === "string" ? overrideValue : asset.value;
      return {
        name: asset.name,
        scope,
        ...(description !== undefined ? { description } : {}),
        value: { type: "text", value },
      };
    }
    case "integer": {
      const value = typeof overrideValue === "number" ? Math.trunc(overrideValue) : asset.value;
      return {
        name: asset.name,
        scope,
        ...(description !== undefined ? { description } : {}),
        value: { type: "integer", value },
      };
    }
    case "boolean": {
      const value = typeof overrideValue === "boolean" ? overrideValue : asset.value;
      return {
        name: asset.name,
        scope,
        ...(description !== undefined ? { description } : {}),
        value: { type: "boolean", value },
      };
    }
    case "credential":
      // The credential value (username/password) is resolved at apply time
      // from credential-source. The diff layer operates on definitions only.
      return {
        name: asset.name,
        scope,
        ...(description !== undefined ? { description } : {}),
        value: { type: "credential", username: asset.value, password: "" },
      };
  }
}

function toQueueInput(queue: ConfigQueue): CreateQueueDefinitionInput {
  return {
    name: queue.name,
    ...(queue.description !== undefined ? { description: queue.description } : {}),
    acceptAutoRetry: queue.acceptAutoRetry,
    maxRetries: queue.maxRetries,
    enforceUniqueReferences: queue.enforceUniqueReferences,
    ...(queue.slaMinutes !== undefined ? { slaMinutes: queue.slaMinutes } : {}),
  };
}

function toBucketInput(bucket: ConfigBucket): CreateBucketInput {
  const provider = mapBucketProvider(bucket.storageProvider);
  return {
    name: bucket.name,
    ...(bucket.description !== undefined ? { description: bucket.description } : {}),
    storageProvider: provider,
    ...(bucket.storageContainerPath !== undefined
      ? { storageContainer: bucket.storageContainerPath }
      : {}),
  };
}

function mapScope(scope: "global" | "per-user" | "per-robot"): AssetScope {
  switch (scope) {
    case "global":
      return "Global";
    case "per-user":
      return "PerUser";
    case "per-robot":
      return "PerRobot";
  }
}

function mapBucketProvider(provider: "orchestrator" | "s3" | "azure-blob"): BucketStorageProvider {
  switch (provider) {
    case "orchestrator":
      return "Orchestrator";
    case "s3":
      return "Amazon";
    case "azure-blob":
      return "Azure";
  }
}

function assetDiffers(current: Asset, desired: CreateAssetInput): boolean {
  if (current.scope !== desired.scope) return true;
  if ((current.description ?? "") !== (desired.description ?? "")) return true;
  if (current.type !== desired.value.type) return true;
  switch (current.type) {
    case "text":
      return desired.value.type !== "text" || current.value !== desired.value.value;
    case "integer":
      return desired.value.type !== "integer" || current.value !== desired.value.value;
    case "boolean":
      return desired.value.type !== "boolean" || current.value !== desired.value.value;
    case "credential":
      return desired.value.type !== "credential" || current.username !== desired.value.username;
  }
}

function queueDiffers(current: QueueDefinition, desired: CreateQueueDefinitionInput): boolean {
  return (
    (current.description ?? "") !== (desired.description ?? "") ||
    current.acceptAutoRetry !== desired.acceptAutoRetry ||
    current.maxRetries !== desired.maxRetries ||
    current.enforceUniqueReferences !== desired.enforceUniqueReferences ||
    (current.slaMinutes ?? 0) !== (desired.slaMinutes ?? 0)
  );
}

function bucketDiffers(current: Bucket, desired: CreateBucketInput): boolean {
  return (
    (current.description ?? "") !== (desired.description ?? "") ||
    current.storageProvider !== desired.storageProvider ||
    (current.storageContainer ?? "") !== (desired.storageContainer ?? "")
  );
}

function orderByAction(ops: readonly DiffOperation[]): readonly DiffOperation[] {
  // Per CLAUDE.md: creates → updates → deletes, stop on first error.
  const buckets: Record<DiffOperation["action"], DiffOperation[]> = {
    create: [],
    update: [],
    delete: [],
  };
  for (const op of ops) buckets[op.action].push(op);
  return [...buckets.create, ...buckets.update, ...buckets.delete];
}

function summarize(
  ops: readonly DiffOperation[],
  desiredCount: number,
  currentCount: number,
): ResourceSummary {
  let creates = 0;
  let updates = 0;
  let deletes = 0;
  for (const op of ops) {
    if (op.action === "create") creates += 1;
    else if (op.action === "update") updates += 1;
    else deletes += 1;
  }
  // unchanged = how many desired entries already match current state.
  const unchanged = Math.max(desiredCount - creates - updates, 0);
  // We accept that unchanged can be derived approximately when current
  // contains records the project doesn't manage. The precise number isn't
  // load-bearing — Slack just shows totals.
  void currentCount;
  return { creates, updates, deletes, unchanged };
}
