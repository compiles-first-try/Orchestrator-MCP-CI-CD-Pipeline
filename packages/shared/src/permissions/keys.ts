export const PERMISSIONS = {
  PROJECT_PROVISION: "project.provision",
  PROJECT_LIST: "project.list",
  PROJECT_READ: "project.read",
  PR_OPEN_DEV_TO_TEST: "pr.open.dev_to_test",
  PR_OPEN_TEST_TO_STAGE: "pr.open.test_to_stage",
  PR_OPEN_STAGE_TO_PROD: "pr.open.stage_to_prod",
  PR_APPROVE_DEV_TO_TEST: "pr.approve.dev_to_test",
  PR_APPROVE_TEST_TO_STAGE: "pr.approve.test_to_stage",
  PR_APPROVE_STAGE_TO_PROD: "pr.approve.stage_to_prod",
  ANNOTATION_EDIT_DEV: "annotation.edit.dev",
  ANNOTATION_EDIT_TEST: "annotation.edit.test",
  ROLE_CREATE: "role.create",
  ROLE_ASSIGN: "role.assign",
  CREDENTIAL_SET: "credential.set",
  AUDIT_VIEW: "audit.view",
  ASSET_QUERY: "asset.query",
  XAML_VIEW: "xaml.view",
  CONFIG_QUICK_EDIT: "config.quick_edit",
  FRAMEWORK_READ: "framework.read",
  FRAMEWORK_WRITE: "framework.write",
  FRAMEWORK_RELEASE: "framework.release",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSION_KEYS: readonly PermissionKey[] = Object.values(PERMISSIONS);

export function isPermissionKey(value: unknown): value is PermissionKey {
  return typeof value === "string" && (ALL_PERMISSION_KEYS as readonly string[]).includes(value);
}
