import { z } from "zod";
import { NameString, SchemaVersionField } from "./primitives.js";
import { SettingValue } from "./settings.js";

// Per-tenant overrides. Sparse: only fields that differ from the base
// definition appear here. The reconciler merges base + override at apply
// time, never the other way around.
//
// Shape:
//   overrides:
//     dev:    { settings: {...}, constants: {...}, assets: {...}, queues: {...}, buckets: {...}, credentials: {...} }
//     test:   { ... }
//     stage:  { ... }
//     prod:   { ... }
//
// For settings/constants: full key → value override. Setting an override key
// to `null` removes that key on the given tenant (deletion semantics).
// For assets/queues/buckets/credentials: keyed by entity `name`, with a
// partial object of fields to override. Fields the override does not mention
// fall through from the base definition.
//
// ASSUMPTION: per-entity override is a partial of base fields, with no
// validation here against the base file. Cross-file consistency
// (`overrides.assets["MyAsset"]` must reference an asset that exists in
// `assets.json`) is enforced by the reconciler, not the schema. Reason: the
// schema layer validates one file at a time; cross-file is a project-level
// concern.

const OverrideValueDelete = z.literal(null);

const SettingOverrideValue = z.union([SettingValue, OverrideValueDelete]);

const SettingsOverride = z.record(z.string().min(1), SettingOverrideValue);

const AssetOverride = z
  .object({
    description: z.string().max(1024).optional(),
    value: z.unknown().optional(),
    tags: z.array(z.string()).optional(),
  })
  .strict();

const QueueOverride = z
  .object({
    description: z.string().max(1024).optional(),
    autoRetry: z.boolean().optional(),
    maxRetries: z.number().int().min(0).max(1000).optional(),
    uniqueReference: z.boolean().optional(),
    encrypted: z.boolean().optional(),
    tags: z.array(z.string()).optional(),
  })
  .strict();

const BucketOverride = z
  .object({
    description: z.string().max(1024).optional(),
    externalName: z.string().min(1).max(512).optional(),
    credentialStoreReference: NameString.optional(),
    storageParameters: z.record(z.string(), z.string()).optional(),
    tags: z.array(z.string()).optional(),
  })
  .strict();

const CredentialOverride = z
  .object({
    description: z.string().max(1024).optional(),
    username: z.string().min(1).max(512).optional(),
    secretSource: z.enum(["manual", "aws"]).optional(),
    secretRef: z.string().min(1).max(2048).optional(),
    tags: z.array(z.string()).optional(),
  })
  .strict();

const TenantOverrides = z
  .object({
    settings: SettingsOverride.optional(),
    constants: SettingsOverride.optional(),
    assets: z.record(NameString, AssetOverride).optional(),
    queues: z.record(NameString, QueueOverride).optional(),
    buckets: z.record(NameString, BucketOverride).optional(),
    credentials: z.record(NameString, CredentialOverride).optional(),
  })
  .strict();

export type TenantOverrides = z.infer<typeof TenantOverrides>;

// Four tenant slots, all optional. Mirrors `TENANTS` from @rpa-platform/shared
// — kept in sync by the test file rather than a runtime check, because zod
// object literal keys must be statically known to preserve type inference.
const OverridesByTenant = z
  .object({
    dev: TenantOverrides.optional(),
    test: TenantOverrides.optional(),
    stage: TenantOverrides.optional(),
    prod: TenantOverrides.optional(),
  })
  .strict();

export const OverridesFile = z.object({
  schemaVersion: SchemaVersionField,
  overrides: OverridesByTenant,
});

export type OverridesFile = z.infer<typeof OverridesFile>;
