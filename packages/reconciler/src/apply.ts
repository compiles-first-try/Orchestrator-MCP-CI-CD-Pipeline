import type { CredentialSource } from "@rpa-platform/credential-source";
import type { CreateAssetInput } from "@rpa-platform/orchestrator-client";
import type {
  AppliedOperation,
  ApplyResult,
  DiffOperation,
  ReconcileInput,
  ReconcilePlan,
} from "./types.js";
import { TenantNotConnectedError } from "@rpa-platform/shared";

export async function applyPlan(input: ReconcileInput, plan: ReconcilePlan): Promise<ApplyResult> {
  if (input.tenantStatus !== "connected") {
    throw new TenantNotConnectedError(input.tenant, input.projectName, {
      correlationId: input.correlationId,
    });
  }
  const applied: AppliedOperation[] = [];
  for (let i = 0; i < plan.operations.length; i += 1) {
    const op = plan.operations[i];
    if (op === undefined) continue;
    const result = await runOperation(op, input);
    applied.push(result);
    if (result.success === false) {
      return { applied, stoppedAt: i, success: false };
    }
  }
  return { applied, stoppedAt: undefined, success: true };
}

async function runOperation(op: DiffOperation, input: ReconcileInput): Promise<AppliedOperation> {
  try {
    if (op.resource === "asset") {
      return await runAssetOp(op, input);
    }
    if (op.resource === "queue") {
      return await runQueueOp(op, input);
    }
    return await runBucketOp(op, input);
  } catch (err) {
    return {
      operation: op,
      transport: "rest_fallback",
      success: false,
      error: describeError(err),
    };
  }
}

async function runAssetOp(
  op: Extract<DiffOperation, { resource: "asset" }>,
  input: ReconcileInput,
): Promise<AppliedOperation> {
  if (op.action === "create" || op.action === "update") {
    const resolvedInput = await resolveCredentialIfNeeded(op.input, input);
    const result =
      op.action === "create"
        ? await input.clients.assets.create(resolvedInput)
        : await input.clients.assets.update(op.id, resolvedInput);
    return {
      operation: op,
      transport: result.transport,
      success: true,
      error: undefined,
    };
  }
  const result = await input.clients.assets.delete(op.id);
  return { operation: op, transport: result.transport, success: true, error: undefined };
}

async function runQueueOp(
  op: Extract<DiffOperation, { resource: "queue" }>,
  input: ReconcileInput,
): Promise<AppliedOperation> {
  if (op.action === "create") {
    const result = await input.clients.queueDefinitions.create(op.input);
    return { operation: op, transport: result.transport, success: true, error: undefined };
  }
  if (op.action === "update") {
    const result = await input.clients.queueDefinitions.update(op.id, op.input);
    return { operation: op, transport: result.transport, success: true, error: undefined };
  }
  const result = await input.clients.queueDefinitions.delete(op.id);
  return { operation: op, transport: result.transport, success: true, error: undefined };
}

async function runBucketOp(
  op: Extract<DiffOperation, { resource: "bucket" }>,
  input: ReconcileInput,
): Promise<AppliedOperation> {
  if (op.action === "create") {
    const result = await input.clients.buckets.create(op.input);
    return { operation: op, transport: result.transport, success: true, error: undefined };
  }
  if (op.action === "update") {
    const result = await input.clients.buckets.update(op.id, op.input);
    return { operation: op, transport: result.transport, success: true, error: undefined };
  }
  const result = await input.clients.buckets.delete(op.id);
  return { operation: op, transport: result.transport, success: true, error: undefined };
}

async function resolveCredentialIfNeeded(
  assetInput: CreateAssetInput,
  input: ReconcileInput,
): Promise<CreateAssetInput> {
  if (assetInput.value.type !== "credential") return assetInput;
  const referencedName = assetInput.value.username;
  const { username, password } = await fetchCredentialValue(
    referencedName,
    input.credentialSource,
    {
      projectId: input.projectId,
      tenant: input.tenant,
    },
  );
  return {
    ...assetInput,
    value: { type: "credential", username, password },
  };
}

async function fetchCredentialValue(
  credentialName: string,
  source: CredentialSource,
  scope: { projectId: string; tenant: ReconcileInput["tenant"] },
): Promise<{ username: string; password: string }> {
  const stored = await source.getValue({
    projectId: scope.projectId,
    tenant: scope.tenant,
    name: credentialName,
  });
  // Convention: username-password credentials store JSON with both fields,
  // anything else (api-key, oauth-token) stores the raw secret in the
  // username slot with an empty password.
  if (stored.startsWith("{")) {
    try {
      const parsed = JSON.parse(stored) as { username?: unknown; password?: unknown };
      const username = typeof parsed.username === "string" ? parsed.username : "";
      const password = typeof parsed.password === "string" ? parsed.password : "";
      return { username, password };
    } catch {
      return { username: stored, password: "" };
    }
  }
  return { username: stored, password: "" };
}

function describeError(err: unknown): { code: string; message: string } {
  if (err !== null && typeof err === "object") {
    const code =
      "code" in err && typeof (err as { code: unknown }).code === "string"
        ? (err as { code: string }).code
        : "reconciler.unknown_error";
    const message =
      "message" in err && typeof (err as { message: unknown }).message === "string"
        ? (err as { message: string }).message
        : "unknown error";
    return { code, message };
  }
  return { code: "reconciler.unknown_error", message: String(err) };
}
