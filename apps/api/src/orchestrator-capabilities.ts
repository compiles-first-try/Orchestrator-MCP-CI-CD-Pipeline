import { PermissionDeniedError } from "@rpa-platform/shared";

// Capabilities exposed by Orchestrator, named exactly as they appear in the
// per-endpoint permission table (verified 2026-05-02 via the official docs:
// `Assets.View`, `Storage Buckets.Create`, etc.). The list intentionally
// excludes `*.Delete` for entities the platform manages — the reconciler
// is non-deleting (memory: no_orchestrator_deletes), so demanding Delete
// permission of every reconcile caller would over-gate the workflow.
export const ORCHESTRATOR_CAPABILITIES = [
  "Assets.View",
  "Assets.Create",
  "Assets.Edit",
  "Assets.Delete",
  "Queues.View",
  "Queues.Create",
  "Queues.Edit",
  "Queues.Delete",
  "Storage Buckets.View",
  "Storage Buckets.Create",
  "Storage Buckets.Edit",
  "Storage Buckets.Delete",
  "Storage Files.View",
  "Storage Files.Create",
  "Storage Files.Edit",
  "Storage Files.Delete",
  "Folders.View",
  "Folders.Create",
  "Folders.Edit",
  "Subfolders.View",
  "Users.View",
  "Roles.View",
] as const;
export type OrchestratorCapability = (typeof ORCHESTRATOR_CAPABILITIES)[number];

// Default capability profile per Orchestrator role. The user can extend this
// at runtime by passing extra entries to `checkCapability` — useful for
// custom roles created in their tenant.
export const KNOWN_ROLE_CAPABILITIES: Readonly<Record<string, ReadonlyArray<OrchestratorCapability>>> = {
  Administrator: [...ORCHESTRATOR_CAPABILITIES],
  "Folder Administrator": [...ORCHESTRATOR_CAPABILITIES],
  Developer: [
    "Assets.View",
    "Assets.Create",
    "Assets.Edit",
    "Queues.View",
    "Queues.Create",
    "Queues.Edit",
    "Storage Buckets.View",
    "Storage Buckets.Create",
    "Storage Buckets.Edit",
    "Storage Files.View",
    "Storage Files.Create",
    "Storage Files.Edit",
    "Folders.View",
    "Subfolders.View",
  ],
  "Business Analyst": ["Assets.View", "Queues.View", "Storage Buckets.View", "Folders.View"],
  Robot: ["Assets.View", "Queues.View", "Storage Buckets.View", "Storage Files.View", "Folders.View"],
};

// What each platform action requires of the caller's Orchestrator role(s).
// `reconcile.apply` deliberately omits `*.Delete` — that's the additive
// path. `reconcile.apply_with_deletes` is used when the matrix grants the
// caller `RECONCILE_DELETE` for the tenant (memory: tiered_delete_policy);
// it adds the four Delete capabilities so the preflight fails fast if the
// caller's Orchestrator role can't actually perform the deletes.
export const PLATFORM_ACTION_REQUIREMENTS = {
  "reconcile.dry_run": [
    "Assets.View",
    "Queues.View",
    "Storage Buckets.View",
    "Folders.View",
  ],
  "reconcile.apply": [
    "Assets.View",
    "Assets.Create",
    "Assets.Edit",
    "Queues.View",
    "Queues.Create",
    "Queues.Edit",
    "Storage Buckets.View",
    "Storage Buckets.Create",
    "Storage Buckets.Edit",
    "Storage Files.View",
    "Storage Files.Create",
    "Storage Files.Edit",
    "Folders.View",
  ],
  "reconcile.apply_with_deletes": [
    "Assets.View",
    "Assets.Create",
    "Assets.Edit",
    "Assets.Delete",
    "Queues.View",
    "Queues.Create",
    "Queues.Edit",
    "Queues.Delete",
    "Storage Buckets.View",
    "Storage Buckets.Create",
    "Storage Buckets.Edit",
    "Storage Buckets.Delete",
    "Storage Files.View",
    "Storage Files.Create",
    "Storage Files.Edit",
    "Storage Files.Delete",
    "Folders.View",
  ],
  "tenant.connect": ["Folders.View", "Roles.View", "Users.View"],
} as const satisfies Readonly<Record<string, ReadonlyArray<OrchestratorCapability>>>;

export type PlatformAction = keyof typeof PLATFORM_ACTION_REQUIREMENTS;

export interface CapabilityCheckResult {
  readonly ok: boolean;
  readonly userCapabilities: ReadonlyArray<OrchestratorCapability>;
  readonly missing: ReadonlyArray<OrchestratorCapability>;
}

export function computeUserCapabilities(
  roleNames: readonly string[],
  extra: Readonly<Record<string, ReadonlyArray<OrchestratorCapability>>> = {},
): ReadonlyArray<OrchestratorCapability> {
  const all: Record<string, ReadonlyArray<OrchestratorCapability>> = { ...KNOWN_ROLE_CAPABILITIES, ...extra };
  const out = new Set<OrchestratorCapability>();
  for (const role of roleNames) {
    const caps = all[role];
    if (caps !== undefined) {
      for (const cap of caps) out.add(cap);
    }
  }
  return [...out];
}

export function checkCapability(
  roleNames: readonly string[],
  action: PlatformAction,
  extra: Readonly<Record<string, ReadonlyArray<OrchestratorCapability>>> = {},
): CapabilityCheckResult {
  const have = new Set(computeUserCapabilities(roleNames, extra));
  const need = PLATFORM_ACTION_REQUIREMENTS[action];
  const missing = need.filter((c) => !have.has(c));
  return {
    ok: missing.length === 0,
    userCapabilities: [...have],
    missing,
  };
}

// Throws PermissionDeniedError when the user's Orchestrator roles do not
// cover the required capabilities. The error's `details.missing` lists the
// exact capabilities that are absent — Slack handlers can render this so
// the user sees what to ask their Orchestrator admin for.
export function requireCapability(
  roleNames: readonly string[],
  action: PlatformAction,
  options: {
    readonly extra?: Readonly<Record<string, ReadonlyArray<OrchestratorCapability>>>;
    readonly correlationId?: string;
    readonly tenant?: string;
  } = {},
): CapabilityCheckResult {
  const result = checkCapability(roleNames, action, options.extra ?? {});
  if (!result.ok) {
    throw new PermissionDeniedError(`orchestrator.capability:${action}`, {
      ...(options.correlationId !== undefined && { correlationId: options.correlationId }),
      details: {
        action,
        ...(options.tenant !== undefined && { tenant: options.tenant }),
        missing: result.missing,
        userCapabilities: result.userCapabilities,
      },
    });
  }
  return result;
}
