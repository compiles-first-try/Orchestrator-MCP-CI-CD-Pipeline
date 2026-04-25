import type { PermissionKey } from "./keys.js";
import type { PermissionContext, PermissionGrant, UserWithRoles } from "./types.js";

export function can(
  user: UserWithRoles,
  permission: PermissionKey,
  context?: PermissionContext,
): boolean {
  for (const role of user.roles) {
    const grant = role.permissions[permission];
    if (grant === undefined) continue;
    if (grantSatisfies(grant, context)) return true;
  }
  return false;
}

function grantSatisfies(grant: PermissionGrant, context: PermissionContext | undefined): boolean {
  if (grant === true) return true;
  // Tenant-scoped grant: tenant must be supplied to evaluate.
  const tenant = context?.tenant;
  if (tenant === undefined) return false;
  if (grant.tenants === "all") return true;
  return grant.tenants.includes(tenant);
}
