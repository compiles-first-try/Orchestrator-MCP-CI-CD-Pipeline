import type {
  Asset,
  AssetsFile,
  Bucket,
  BucketsFile,
  ConstantsFile,
  Credential,
  CredentialsFile,
  OverridesFile,
  Queue,
  QueuesFile,
  SettingValue,
  SettingsFile,
} from "@rpa-platform/config-schema";
import type { TenantName } from "@rpa-platform/shared";

export interface ResolvedConfig {
  readonly tenant: TenantName;
  readonly settings: Readonly<Record<string, SettingValue>>;
  readonly constants: Readonly<Record<string, SettingValue>>;
  readonly assets: readonly Asset[];
  readonly queues: readonly Queue[];
  readonly buckets: readonly Bucket[];
  readonly credentials: readonly Credential[];
}

export interface ResolveInput {
  readonly tenant: TenantName;
  readonly settings: SettingsFile;
  readonly constants: ConstantsFile;
  readonly assets: AssetsFile;
  readonly queues: QueuesFile;
  readonly buckets: BucketsFile;
  readonly credentials: CredentialsFile;
  readonly overrides: OverridesFile;
}

// Apply per-tenant overrides on top of the base config files. The result is
// the source-of-truth shape we serialize to Config.json (and Config.xlsx
// when the framework isn't json-ready). Cross-file references are not
// validated here — that's the reconciler's job.
export function resolveConfig(input: ResolveInput): ResolvedConfig {
  const tenantOverrides = input.overrides.overrides[input.tenant];
  return {
    tenant: input.tenant,
    settings: applyKeyValueOverrides(input.settings.settings, tenantOverrides?.settings),
    constants: applyKeyValueOverrides(input.constants.constants, tenantOverrides?.constants),
    assets: applyEntityOverrides(input.assets.assets, tenantOverrides?.assets),
    queues: applyEntityOverrides(input.queues.queues, tenantOverrides?.queues),
    buckets: applyEntityOverrides(input.buckets.buckets, tenantOverrides?.buckets),
    credentials: applyEntityOverrides(input.credentials.credentials, tenantOverrides?.credentials),
  };
}

function applyKeyValueOverrides(
  base: Readonly<Record<string, SettingValue>>,
  override: Readonly<Record<string, SettingValue | null>> | undefined,
): Readonly<Record<string, SettingValue>> {
  if (override === undefined) return base;
  const merged: Record<string, SettingValue> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value === null) {
      delete merged[key];
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

function applyEntityOverrides<E extends { name: string }>(
  base: readonly E[],
  override: Readonly<Record<string, Readonly<Record<string, unknown>>>> | undefined,
): readonly E[] {
  if (override === undefined) return base;
  return base.map((entity) => {
    const partial = override[entity.name];
    if (partial === undefined) return entity;
    return { ...entity, ...partial } as E;
  });
}
