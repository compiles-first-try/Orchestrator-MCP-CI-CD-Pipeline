import { describe, expect, it } from "vitest";
import {
  ALL_PERMISSION_KEYS,
  PERMISSIONS,
  type Role,
  type RolePermissions,
  type UserWithRoles,
  can,
  isPermissionKey,
} from "../src/permissions/index.js";

function role(name: string, permissions: RolePermissions): Role {
  return { id: `role-${name}`, name, permissions, isSystem: false };
}

function user(...roles: Role[]): UserWithRoles {
  return { id: `user`, roles };
}

describe("can() — branch coverage", () => {
  it("returns false when the user has no roles", () => {
    expect(can(user(), PERMISSIONS.PROJECT_LIST)).toBe(false);
  });

  it("returns false when no role grants the permission", () => {
    const r = role("custom", { [PERMISSIONS.AUDIT_VIEW]: true });
    expect(can(user(r), PERMISSIONS.PROJECT_PROVISION)).toBe(false);
  });

  it("returns true for an unscoped grant (grant === true)", () => {
    const r = role("custom", { [PERMISSIONS.PROJECT_PROVISION]: true });
    expect(can(user(r), PERMISSIONS.PROJECT_PROVISION)).toBe(true);
  });

  it("returns true for an unscoped grant even when tenant context is supplied", () => {
    const r = role("custom", { [PERMISSIONS.PROJECT_PROVISION]: true });
    expect(can(user(r), PERMISSIONS.PROJECT_PROVISION, { tenant: "prod" })).toBe(true);
  });

  it("returns false for a tenant-scoped grant when no context is supplied", () => {
    const r = role("custom", { [PERMISSIONS.ASSET_QUERY]: { tenants: ["dev"] } });
    expect(can(user(r), PERMISSIONS.ASSET_QUERY)).toBe(false);
  });

  it("returns false for a tenant-scoped grant when context lacks a tenant", () => {
    const r = role("custom", { [PERMISSIONS.ASSET_QUERY]: { tenants: ["dev"] } });
    expect(can(user(r), PERMISSIONS.ASSET_QUERY, { project: "demo-bot" })).toBe(false);
  });

  it("returns true for tenants: 'all' regardless of which tenant is in context", () => {
    const r = role("custom", { [PERMISSIONS.ASSET_QUERY]: { tenants: "all" } });
    expect(can(user(r), PERMISSIONS.ASSET_QUERY, { tenant: "prod" })).toBe(true);
    expect(can(user(r), PERMISSIONS.ASSET_QUERY, { tenant: "dev" })).toBe(true);
  });

  it("returns true when the requested tenant is in the grant's tenant list", () => {
    const r = role("custom", { [PERMISSIONS.ASSET_QUERY]: { tenants: ["dev", "test"] } });
    expect(can(user(r), PERMISSIONS.ASSET_QUERY, { tenant: "dev" })).toBe(true);
    expect(can(user(r), PERMISSIONS.ASSET_QUERY, { tenant: "test" })).toBe(true);
  });

  it("returns false when the requested tenant is NOT in the grant's tenant list", () => {
    const r = role("custom", { [PERMISSIONS.ASSET_QUERY]: { tenants: ["dev"] } });
    expect(can(user(r), PERMISSIONS.ASSET_QUERY, { tenant: "stage" })).toBe(false);
  });

  it("unions permissions across multiple roles (later role grants what earlier denies)", () => {
    const restricted = role("restricted", { [PERMISSIONS.PROJECT_LIST]: true });
    const elevated = role("elevated", { [PERMISSIONS.PROJECT_PROVISION]: true });
    expect(can(user(restricted, elevated), PERMISSIONS.PROJECT_PROVISION)).toBe(true);
  });

  it("unions tenant scopes across multiple roles", () => {
    const onDev = role("dev-only", { [PERMISSIONS.ASSET_QUERY]: { tenants: ["dev"] } });
    const onStage = role("stage-only", { [PERMISSIONS.ASSET_QUERY]: { tenants: ["stage"] } });
    const u = user(onDev, onStage);
    expect(can(u, PERMISSIONS.ASSET_QUERY, { tenant: "dev" })).toBe(true);
    expect(can(u, PERMISSIONS.ASSET_QUERY, { tenant: "stage" })).toBe(true);
    expect(can(u, PERMISSIONS.ASSET_QUERY, { tenant: "prod" })).toBe(false);
  });

  it("ignores the repo context (v1 does not consult it)", () => {
    const r = role("custom", { [PERMISSIONS.FRAMEWORK_WRITE]: true });
    expect(can(user(r), PERMISSIONS.FRAMEWORK_WRITE, { repo: "framework" })).toBe(true);
    expect(can(user(r), PERMISSIONS.FRAMEWORK_WRITE, { repo: "project" })).toBe(true);
  });
});

describe("isPermissionKey", () => {
  it("accepts every defined permission key", () => {
    for (const key of ALL_PERMISSION_KEYS) {
      expect(isPermissionKey(key)).toBe(true);
    }
  });

  it("rejects unknown strings and non-string values", () => {
    expect(isPermissionKey("not.a.real.permission")).toBe(false);
    expect(isPermissionKey("")).toBe(false);
    expect(isPermissionKey(undefined)).toBe(false);
    expect(isPermissionKey(null)).toBe(false);
    expect(isPermissionKey(42)).toBe(false);
    expect(isPermissionKey({})).toBe(false);
  });
});
