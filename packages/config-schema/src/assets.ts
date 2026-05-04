import { z } from "zod";
import { DescriptionString, NameString, SchemaVersionField, TagList } from "./primitives.js";

// Asset value-types we provision. We intentionally exclude `Credential` and
// `WindowsCredential` from this file — credentials live in their own file
// (credentials.json) so secret-source wiring stays separated from data.
//
// ASSUMPTION: This is the full set the platform manages. Orchestrator may
// support more; if the user needs another type, it must be added here
// explicitly rather than allowed through.
export const ASSET_VALUE_TYPES = ["text", "integer", "bool", "keyValueList"] as const;
export const AssetValueType = z.enum(ASSET_VALUE_TYPES);
export type AssetValueType = z.infer<typeof AssetValueType>;

const KeyValueListValue = z
  .array(
    z.object({
      key: z.string().min(1),
      value: z.string(),
    }),
  )
  .max(256);

const TextAsset = z.object({
  name: NameString,
  description: DescriptionString.optional(),
  type: z.literal("text"),
  value: z.string(),
  tags: TagList.optional(),
});

const IntegerAsset = z.object({
  name: NameString,
  description: DescriptionString.optional(),
  type: z.literal("integer"),
  value: z.number().int().safe(),
  tags: TagList.optional(),
});

const BoolAsset = z.object({
  name: NameString,
  description: DescriptionString.optional(),
  type: z.literal("bool"),
  value: z.boolean(),
  tags: TagList.optional(),
});

const KeyValueListAsset = z.object({
  name: NameString,
  description: DescriptionString.optional(),
  type: z.literal("keyValueList"),
  value: KeyValueListValue,
  tags: TagList.optional(),
});

export const Asset = z.discriminatedUnion("type", [TextAsset, IntegerAsset, BoolAsset, KeyValueListAsset]);
export type Asset = z.infer<typeof Asset>;

// Names must be unique within a project's asset list. Enforced here so the
// reconciler can address assets by name without ambiguity.
export const AssetsFile = z
  .object({
    schemaVersion: SchemaVersionField,
    assets: z.array(Asset).max(2048),
  })
  .superRefine((file, ctx) => {
    const seen = new Set<string>();
    for (let i = 0; i < file.assets.length; i++) {
      const asset = file.assets[i];
      if (asset === undefined) continue;
      if (seen.has(asset.name)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["assets", i, "name"],
          message: `duplicate asset name '${asset.name}'`,
        });
      }
      seen.add(asset.name);
    }
  });

export type AssetsFile = z.infer<typeof AssetsFile>;
