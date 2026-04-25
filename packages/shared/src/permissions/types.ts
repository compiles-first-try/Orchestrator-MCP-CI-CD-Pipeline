import type { TenantName } from "../tenants.js";
import type { PermissionKey } from "./keys.js";

export type TenantScope = "all" | readonly TenantName[];

export type PermissionGrant = true | { readonly tenants: TenantScope };

export type RolePermissions = Readonly<Partial<Record<PermissionKey, PermissionGrant>>>;

export interface Role {
  readonly id: string;
  readonly name: string;
  readonly permissions: RolePermissions;
  readonly isSystem: boolean;
}

export interface UserWithRoles {
  readonly id: string;
  readonly roles: readonly Role[];
}

export interface PermissionContext {
  readonly tenant?: TenantName;
  readonly project?: string;
  readonly repo?: "framework" | "project";
}
