import { describe, expect, it } from "vitest";
import {
  ADMIN_PERMISSIONS,
  ALL_PERMISSION_KEYS,
  BA_PERMISSIONS,
  DEVELOPER_PERMISSIONS,
  PERMISSIONS,
  type PermissionKey,
  type Role,
  type RolePermissions,
  type UserWithRoles,
  can,
} from "../src/permissions/index.js";
import { TENANTS, type TenantName } from "../src/tenants.js";

type SystemRoleName = "developer" | "admin" | "ba";

const SYSTEM_ROLE_PERMS: Record<SystemRoleName, RolePermissions> = {
  developer: DEVELOPER_PERMISSIONS,
  admin: ADMIN_PERMISSIONS,
  ba: BA_PERMISSIONS,
};

function userWith(roleName: SystemRoleName): UserWithRoles {
  const role: Role = {
    id: `role-${roleName}`,
    name: roleName,
    permissions: SYSTEM_ROLE_PERMS[roleName],
    isSystem: true,
  };
  return { id: `user-${roleName}`, roles: [role] };
}

/**
 * Encodes the §7 spec matrix exactly. For tenant-scoped permissions, the value
 * is a per-tenant map; otherwise it's a flat boolean (no tenant context needed).
 */
type MatrixCell = boolean | Record<TenantName, boolean>;

const MATRIX: Record<PermissionKey, Record<SystemRoleName, MatrixCell>> = {
  [PERMISSIONS.PROJECT_PROVISION]: { developer: false, admin: true, ba: false },
  [PERMISSIONS.PROJECT_LIST]: { developer: true, admin: true, ba: true },
  [PERMISSIONS.PROJECT_READ]: { developer: true, admin: true, ba: true },
  [PERMISSIONS.PR_OPEN_DEV_TO_TEST]: { developer: true, admin: true, ba: false },
  [PERMISSIONS.PR_OPEN_TEST_TO_STAGE]: { developer: false, admin: true, ba: false },
  [PERMISSIONS.PR_OPEN_STAGE_TO_PROD]: { developer: false, admin: false, ba: true },
  [PERMISSIONS.PR_APPROVE_DEV_TO_TEST]: { developer: false, admin: true, ba: false },
  [PERMISSIONS.PR_APPROVE_TEST_TO_STAGE]: { developer: false, admin: true, ba: false },
  [PERMISSIONS.PR_APPROVE_STAGE_TO_PROD]: { developer: false, admin: false, ba: true },
  [PERMISSIONS.ANNOTATION_EDIT_DEV]: { developer: true, admin: true, ba: false },
  [PERMISSIONS.ANNOTATION_EDIT_TEST]: { developer: true, admin: true, ba: false },
  [PERMISSIONS.ROLE_CREATE]: { developer: false, admin: true, ba: false },
  [PERMISSIONS.ROLE_ASSIGN]: { developer: false, admin: true, ba: false },
  [PERMISSIONS.CREDENTIAL_SET]: { developer: false, admin: true, ba: false },
  [PERMISSIONS.AUDIT_VIEW]: { developer: false, admin: true, ba: true },
  [PERMISSIONS.XAML_VIEW]: { developer: true, admin: true, ba: true },
  [PERMISSIONS.FRAMEWORK_READ]: { developer: true, admin: true, ba: true },
  [PERMISSIONS.FRAMEWORK_WRITE]: { developer: false, admin: true, ba: false },
  [PERMISSIONS.FRAMEWORK_RELEASE]: { developer: false, admin: true, ba: false },
  [PERMISSIONS.ASSET_QUERY]: {
    developer: { dev: true, test: false, stage: false, prod: false },
    admin: { dev: true, test: true, stage: true, prod: true },
    ba: { dev: true, test: true, stage: true, prod: true },
  },
  [PERMISSIONS.CONFIG_QUICK_EDIT]: {
    developer: { dev: true, test: false, stage: false, prod: false },
    admin: { dev: true, test: true, stage: true, prod: true },
    ba: { dev: false, test: false, stage: false, prod: false },
  },
};

describe("permissions matrix (§7 contract)", () => {
  it("covers every defined permission key", () => {
    expect(Object.keys(MATRIX).sort()).toEqual([...ALL_PERMISSION_KEYS].sort());
  });

  for (const permission of ALL_PERMISSION_KEYS) {
    const cellByRole = MATRIX[permission];
    if (cellByRole === undefined) {
      throw new Error(`Matrix missing permission ${permission}`);
    }

    describe(permission, () => {
      for (const roleName of ["developer", "admin", "ba"] as const) {
        const expected = cellByRole[roleName];

        if (typeof expected === "boolean") {
          it(`${roleName} → ${String(expected)}`, () => {
            expect(can(userWith(roleName), permission)).toBe(expected);
          });

          // Tenant context should not change a non-tenant-scoped result.
          for (const tenant of TENANTS) {
            it(`${roleName} → ${String(expected)} (with tenant=${tenant})`, () => {
              expect(can(userWith(roleName), permission, { tenant })).toBe(expected);
            });
          }
        } else {
          // Tenant-scoped permission: assert per tenant.
          for (const tenant of TENANTS) {
            const expectedForTenant = expected[tenant];
            it(`${roleName} on tenant=${tenant} → ${String(expectedForTenant)}`, () => {
              expect(can(userWith(roleName), permission, { tenant })).toBe(expectedForTenant);
            });
          }

          // No tenant context on a tenant-scoped permission should deny conservatively.
          it(`${roleName} without tenant context → false (conservative deny)`, () => {
            expect(can(userWith(roleName), permission)).toBe(false);
          });
        }
      }
    });
  }
});
