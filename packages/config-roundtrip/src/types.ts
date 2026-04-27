import type { ProjectConfig } from "@rpa-platform/config-schema";
import type { TenantName } from "@rpa-platform/shared";

export type TenantConfigs = Readonly<Record<TenantName, ProjectConfig>>;

export const TENANT_ORDER: readonly TenantName[] = ["dev", "test", "stage", "prod"];
