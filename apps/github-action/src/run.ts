import { callReconcile, type ReconcileMode } from "./reconcile-call.js";
import { formatPrComment } from "./format-comment.js";

async function main(): Promise<void> {
  const required = (key: string): string => {
    const value = process.env[key];
    if (value === undefined || value.length === 0) {
      throw new Error(`missing required env: ${key}`);
    }
    return value;
  };

  const mode = required("RPA_MODE") as ReconcileMode;
  if (mode !== "dry-run" && mode !== "apply") {
    throw new Error(`mode must be dry-run or apply, got '${mode}'`);
  }
  const tenant = required("RPA_TENANT");
  if (tenant !== "dev" && tenant !== "test" && tenant !== "stage" && tenant !== "prod") {
    throw new Error(`tenant must be dev/test/stage/prod, got '${tenant}'`);
  }

  const result = await callReconcile({
    apiUrl: required("RPA_API_URL"),
    apiToken: required("RPA_API_TOKEN"),
    mode,
    projectName: required("RPA_PROJECT_NAME"),
    tenant,
    branch: required("RPA_BRANCH"),
    commitSha: required("RPA_COMMIT_SHA"),
    ...(process.env["RPA_APPROVER_LOGIN"] !== undefined &&
    process.env["RPA_APPROVER_LOGIN"].length > 0
      ? { approverLogin: process.env["RPA_APPROVER_LOGIN"] }
      : {}),
  });

  process.stdout.write(formatPrComment(mode, result.status, result.body) + "\n");
  if (result.status >= 400) {
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`github-action failed: ${describe(err)}\n`);
  process.exit(1);
});

function describe(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
