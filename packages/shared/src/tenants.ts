export const TENANTS = ["dev", "test", "stage", "prod"] as const;

export type TenantName = (typeof TENANTS)[number];

export function isTenantName(value: unknown): value is TenantName {
  return typeof value === "string" && (TENANTS as readonly string[]).includes(value);
}
