import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { TENANTS, type TenantName } from "@rpa-platform/shared";
import {
  parseAssets,
  parseBuckets,
  parseConstants,
  parseCredentials,
  parseOverrides,
  parseQueues,
  parseSettings,
  type ProjectConfig,
} from "@rpa-platform/config-schema";
import type { TenantConfigs } from "@rpa-platform/config-roundtrip";

const FILES = {
  settings: "settings.json",
  constants: "constants.json",
  assets: "assets.json",
  queues: "queues.json",
  buckets: "buckets.json",
  credentials: "credentials.json",
  overrides: "overrides.json",
} as const;

export async function loadTenantConfigsFromDisk(projectDir: string): Promise<TenantConfigs> {
  const out = {} as Record<TenantName, ProjectConfig>;
  for (const tenant of TENANTS) {
    out[tenant] = await loadTenantConfig(join(projectDir, tenant));
  }
  return out;
}

export async function writeTenantConfigsToDisk(
  projectDir: string,
  perTenant: TenantConfigs,
): Promise<void> {
  for (const tenant of TENANTS) {
    await writeTenantConfig(join(projectDir, tenant), perTenant[tenant]);
  }
}

async function loadTenantConfig(tenantDir: string): Promise<ProjectConfig> {
  const [settings, constants, assets, queues, buckets, credentials, overrides] = await Promise.all([
    loadJsonOr(join(tenantDir, FILES.settings), {}, parseSettings),
    loadJsonOr(join(tenantDir, FILES.constants), {}, parseConstants),
    loadJsonOr(join(tenantDir, FILES.assets), [], parseAssets),
    loadJsonOr(join(tenantDir, FILES.queues), [], parseQueues),
    loadJsonOr(join(tenantDir, FILES.buckets), [], parseBuckets),
    loadJsonOr(join(tenantDir, FILES.credentials), [], parseCredentials),
    loadJsonOr(join(tenantDir, FILES.overrides), {}, parseOverrides),
  ]);
  return {
    settings,
    constants,
    assets,
    queues,
    buckets,
    credentials,
    overrides,
  };
}

async function writeTenantConfig(tenantDir: string, config: ProjectConfig): Promise<void> {
  await mkdir(tenantDir, { recursive: true });
  await Promise.all([
    writeJson(join(tenantDir, FILES.settings), config.settings),
    writeJson(join(tenantDir, FILES.constants), config.constants),
    writeJson(join(tenantDir, FILES.assets), config.assets),
    writeJson(join(tenantDir, FILES.queues), config.queues),
    writeJson(join(tenantDir, FILES.buckets), config.buckets),
    writeJson(join(tenantDir, FILES.credentials), config.credentials),
    writeJson(join(tenantDir, FILES.overrides), config.overrides),
  ]);
}

async function loadJsonOr<T>(
  path: string,
  fallback: unknown,
  parser: (input: unknown) => T,
): Promise<T> {
  try {
    const raw = await readFile(path, "utf8");
    return parser(JSON.parse(raw));
  } catch (err) {
    if (isMissing(err)) return parser(fallback);
    throw err;
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + "\n");
}

function isMissing(err: unknown): boolean {
  return (
    err !== null &&
    typeof err === "object" &&
    "code" in err &&
    (err as { code: unknown }).code === "ENOENT"
  );
}
