import { PERMISSIONS } from "./keys.js";
import type { RolePermissions } from "./types.js";

export const DEVELOPER_PERMISSIONS: RolePermissions = {
  [PERMISSIONS.PROJECT_LIST]: true,
  [PERMISSIONS.PROJECT_READ]: true,
  [PERMISSIONS.PR_OPEN_DEV_TO_TEST]: true,
  [PERMISSIONS.ANNOTATION_EDIT_DEV]: true,
  [PERMISSIONS.ANNOTATION_EDIT_TEST]: true,
  [PERMISSIONS.ASSET_QUERY]: { tenants: ["dev"] },
  [PERMISSIONS.XAML_VIEW]: true,
  [PERMISSIONS.CONFIG_QUICK_EDIT]: { tenants: ["dev"] },
  [PERMISSIONS.FRAMEWORK_READ]: true,
  // 2026-05-03: developers can delete assets/queues/buckets on dev only.
  // test/stage stay locked; prod is locked for everyone (Orchestrator UI only).
  [PERMISSIONS.RECONCILE_DELETE]: { tenants: ["dev"] },
};

export const ADMIN_PERMISSIONS: RolePermissions = {
  ...DEVELOPER_PERMISSIONS,
  [PERMISSIONS.PROJECT_PROVISION]: true,
  [PERMISSIONS.PR_OPEN_TEST_TO_STAGE]: true,
  [PERMISSIONS.PR_APPROVE_DEV_TO_TEST]: true,
  [PERMISSIONS.PR_APPROVE_TEST_TO_STAGE]: true,
  // 2026-05-03: stage→prod approval is shared with BA per the user's
  // "combination of admin and business analysts" rule. The matrix lets
  // either system role click approve in Slack; GitHub branch protection
  // layers reviewer-count requirements on top via CODEOWNERS.
  [PERMISSIONS.PR_APPROVE_STAGE_TO_PROD]: true,
  [PERMISSIONS.ROLE_CREATE]: true,
  [PERMISSIONS.ROLE_ASSIGN]: true,
  [PERMISSIONS.CREDENTIAL_SET]: true,
  [PERMISSIONS.AUDIT_VIEW]: true,
  [PERMISSIONS.ASSET_QUERY]: { tenants: "all" },
  [PERMISSIONS.CONFIG_QUICK_EDIT]: { tenants: "all" },
  [PERMISSIONS.FRAMEWORK_WRITE]: true,
  [PERMISSIONS.FRAMEWORK_RELEASE]: true,
  // 2026-05-03: admins can delete in dev/test/stage. Prod is intentionally
  // absent — production deletes go through the Orchestrator UI only.
  [PERMISSIONS.RECONCILE_DELETE]: { tenants: ["dev", "test", "stage"] },
};

export const BA_PERMISSIONS: RolePermissions = {
  [PERMISSIONS.PROJECT_LIST]: true,
  [PERMISSIONS.PROJECT_READ]: true,
  [PERMISSIONS.PR_OPEN_STAGE_TO_PROD]: true,
  // 2026-05-03: BA can also approve test→stage (the "admin AND BA combination"
  // for the test→stage and stage→prod gates). Same dual-approval rule as
  // ADMIN — the matrix permits, GitHub branch protection enforces reviewer
  // counts via CODEOWNERS.
  [PERMISSIONS.PR_APPROVE_TEST_TO_STAGE]: true,
  [PERMISSIONS.PR_APPROVE_STAGE_TO_PROD]: true,
  [PERMISSIONS.AUDIT_VIEW]: true,
  [PERMISSIONS.ASSET_QUERY]: { tenants: "all" },
  [PERMISSIONS.XAML_VIEW]: true,
  [PERMISSIONS.FRAMEWORK_READ]: true,
  // 2026-05-03: BA / manager-equivalent can delete on stage only.
  // dev/test stay restricted to admin/developer; prod is Orchestrator-UI-only.
  [PERMISSIONS.RECONCILE_DELETE]: { tenants: ["stage"] },
};

export type SystemRoleName = "developer" | "admin" | "ba";

export const SYSTEM_ROLES: Readonly<Record<SystemRoleName, RolePermissions>> = {
  developer: DEVELOPER_PERMISSIONS,
  admin: ADMIN_PERMISSIONS,
  ba: BA_PERMISSIONS,
};
