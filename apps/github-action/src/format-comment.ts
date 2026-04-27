import type { ReconcileMode } from "./reconcile-call.js";

interface PlanLike {
  readonly summary?: {
    readonly assets?: { creates?: number; updates?: number; deletes?: number };
    readonly queues?: { creates?: number; updates?: number; deletes?: number };
    readonly buckets?: { creates?: number; updates?: number; deletes?: number };
  };
}

interface ResponseShape {
  readonly correlationId?: string;
  readonly plan?: PlanLike;
  readonly applyResult?: {
    readonly success?: boolean;
    readonly stoppedAt?: number;
  };
}

export function formatPrComment(mode: ReconcileMode, status: number, body: unknown): string {
  if (status >= 400 || body === undefined || body === null) {
    return [
      `### rpa-platform ${mode} — failed`,
      ``,
      `API returned HTTP ${status}.`,
      "```json",
      JSON.stringify(body, null, 2),
      "```",
    ].join("\n");
  }
  const response = body as ResponseShape;
  const summary = response.plan?.summary;
  const lines = [
    `### rpa-platform ${mode}`,
    ``,
    `Correlation id: \`${response.correlationId ?? "unknown"}\``,
    ``,
    `| Resource | Creates | Updates | Deletes |`,
    `| --- | --- | --- | --- |`,
    `| Assets  | ${summary?.assets?.creates ?? 0} | ${summary?.assets?.updates ?? 0} | ${summary?.assets?.deletes ?? 0} |`,
    `| Queues  | ${summary?.queues?.creates ?? 0} | ${summary?.queues?.updates ?? 0} | ${summary?.queues?.deletes ?? 0} |`,
    `| Buckets | ${summary?.buckets?.creates ?? 0} | ${summary?.buckets?.updates ?? 0} | ${summary?.buckets?.deletes ?? 0} |`,
  ];
  if (mode === "apply" && response.applyResult !== undefined) {
    lines.push(
      ``,
      response.applyResult.success === true
        ? `:white_check_mark: Apply succeeded.`
        : `:x: Apply stopped at operation ${response.applyResult.stoppedAt ?? "?"}.`,
    );
  }
  return lines.join("\n");
}
