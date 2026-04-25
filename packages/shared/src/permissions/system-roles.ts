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
};

export const ADMIN_PERMISSIONS: RolePermissions = {
  ...DEVELOPER_PERMISSIONS,
  [PERMISSIONS.PROJECT_PROVISION]: true,
  [PERMISSIONS.PR_OPEN_TEST_TO_STAGE]: true,
  [PERMISSIONS.PR_APPROVE_DEV_TO_TEST]: true,
  [PERMISSIONS.PR_APPROVE_TEST_TO_STAGE]: true,
  [PERMISSIONS.ROLE_CREATE]: true,
  [PERMISSIONS.ROLE_ASSIGN]: true,
  [PERMISSIONS.CREDENTIAL_SET]: true,
  [PERMISSIONS.AUDIT_VIEW]: true,
  [PERMISSIONS.ASSET_QUERY]: { tenants: "all" },
  [PERMISSIONS.CONFIG_QUICK_EDIT]: { tenants: "all" },
  [PERMISSIONS.FRAMEWORK_WRITE]: true,
  [PERMISSIONS.FRAMEWORK_RELEASE]: true,
};

export const BA_PERMISSIONS: RolePermissions = {
  [PERMISSIONS.PROJECT_LIST]: true,
  [PERMISSIONS.PROJECT_READ]: true,
  [PERMISSIONS.PR_OPEN_STAGE_TO_PROD]: true,
  [PERMISSIONS.PR_APPROVE_STAGE_TO_PROD]: true,
  [PERMISSIONS.AUDIT_VIEW]: true,
  [PERMISSIONS.ASSET_QUERY]: { tenants: "all" },
  [PERMISSIONS.XAML_VIEW]: true,
  [PERMISSIONS.FRAMEWORK_READ]: true,
};

export type SystemRoleName = "developer" | "admin" | "ba";

export const SYSTEM_ROLES: Readonly<Record<SystemRoleName, RolePermissions>> = {
  developer: DEVELOPER_PERMISSIONS,
  admin: ADMIN_PERMISSIONS,
  ba: BA_PERMISSIONS,
};
