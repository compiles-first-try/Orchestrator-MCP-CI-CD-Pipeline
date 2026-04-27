import { RpaPlatformError } from "@rpa-platform/shared";

export type ReconcileMode = "dry-run" | "apply";

export interface ReconcileCallInput {
  readonly apiUrl: string;
  readonly apiToken: string;
  readonly mode: ReconcileMode;
  readonly projectName: string;
  readonly tenant: "dev" | "test" | "stage" | "prod";
  readonly branch: string;
  readonly commitSha: string;
  readonly approverLogin?: string;
  readonly correlationId?: string;
  readonly fetch?: typeof globalThis.fetch;
}

export interface ReconcileCallResult {
  readonly status: number;
  readonly body: unknown;
}

export class ReconcileCallError extends RpaPlatformError {
  constructor(reason: string, status?: number) {
    super("github_action.reconcile_failed", `Reconcile call failed: ${reason}.`, {
      details: status !== undefined ? { status } : {},
    });
  }
}

export async function callReconcile(input: ReconcileCallInput): Promise<ReconcileCallResult> {
  const fetchFn = input.fetch ?? globalThis.fetch;
  const baseUrl = input.apiUrl.endsWith("/") ? input.apiUrl.slice(0, -1) : input.apiUrl;
  const path = input.mode === "dry-run" ? "/reconcile/dry-run" : "/reconcile/apply";
  const body = JSON.stringify({
    projectName: input.projectName,
    tenant: input.tenant,
    branch: input.branch,
    commitSha: input.commitSha,
  });
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${input.apiToken}`,
  };
  if (input.approverLogin !== undefined) {
    headers["X-RPA-Approver-Login"] = input.approverLogin;
  }
  if (input.correlationId !== undefined) {
    headers["X-Correlation-Id"] = input.correlationId;
  }
  let response: Response;
  try {
    response = await fetchFn(`${baseUrl}${path}`, {
      method: "POST",
      headers,
      body,
    });
  } catch (cause) {
    throw new ReconcileCallError("API unreachable");
  }
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    parsed = undefined;
  }
  return { status: response.status, body: parsed };
}
