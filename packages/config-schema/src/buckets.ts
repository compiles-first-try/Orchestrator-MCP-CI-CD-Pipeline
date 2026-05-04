import { z } from "zod";
import { DescriptionString, NameString, SchemaVersionField, TagList } from "./primitives.js";

// StorageProvider values supported by Orchestrator. ASSUMPTION: this list
// covers the providers v1 cares about. v1 buckets are typically
// `orchestrator` (Orchestrator-managed storage); other providers are
// declarable but require external credentials wired through credentials.json
// or credential stores configured in Orchestrator.
export const STORAGE_PROVIDERS = [
  "orchestrator",
  "amazon",
  "azure",
  "azureKeyVault",
  "amazonRoleBased",
  "minio",
  "gcp",
] as const;

export const StorageProvider = z.enum(STORAGE_PROVIDERS);
export type StorageProvider = z.infer<typeof StorageProvider>;

export const Bucket = z
  .object({
    name: NameString,
    description: DescriptionString.optional(),
    provider: StorageProvider.default("orchestrator"),

    // Required when provider is anything other than `orchestrator`. Maps to
    // Orchestrator's `StorageContainer` / `ExternalName` (which one depends
    // on provider). The reconciler picks the right wire field at apply time.
    externalName: z.string().min(1).max(512).optional(),

    // Reference to a Credential Store registered in Orchestrator. Required
    // for some external providers; not used for `orchestrator`.
    credentialStoreReference: NameString.optional(),

    // Free-form provider-specific knobs (region, endpoint, prefix, etc.).
    // Pass-through; the reconciler hands these to Orchestrator as-is.
    storageParameters: z.record(z.string(), z.string()).optional(),

    tags: TagList.optional(),
  })
  .superRefine((bucket, ctx) => {
    if (bucket.provider !== "orchestrator" && bucket.externalName === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["externalName"],
        message: `externalName is required when provider is '${bucket.provider}'`,
      });
    }
  });

export type Bucket = z.infer<typeof Bucket>;

export const BucketsFile = z
  .object({
    schemaVersion: SchemaVersionField,
    buckets: z.array(Bucket).max(512),
  })
  .superRefine((file, ctx) => {
    const seen = new Set<string>();
    for (let i = 0; i < file.buckets.length; i++) {
      const bucket = file.buckets[i];
      if (bucket === undefined) continue;
      if (seen.has(bucket.name)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["buckets", i, "name"],
          message: `duplicate bucket name '${bucket.name}'`,
        });
      }
      seen.add(bucket.name);
    }
  });

export type BucketsFile = z.infer<typeof BucketsFile>;
