import type { ApplyResult, ReconcilePlan } from "@rpa-platform/reconciler";
import type { TenantName, UserWithRoles } from "@rpa-platform/shared";

export interface ReconcileRequestBody {
  readonly projectName: string;
  readonly tenant: TenantName;
  readonly commitSha: string;
  readonly branch: string;
}

export interface ReconcileContext {
  readonly actor: UserWithRoles;
  readonly correlationId: string;
}

export interface DryRunOutcome {
  readonly plan: ReconcilePlan;
}

export interface ApplyOutcome {
  readonly plan: ReconcilePlan;
  readonly applyResult: ApplyResult;
}

export type DryRunRunner = (
  body: ReconcileRequestBody,
  context: ReconcileContext,
) => Promise<DryRunOutcome>;

export type ApplyRunner = (
  body: ReconcileRequestBody,
  context: ReconcileContext,
) => Promise<ApplyOutcome>;
