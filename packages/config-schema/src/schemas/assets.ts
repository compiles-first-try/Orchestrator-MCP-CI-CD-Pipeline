import { z } from "zod";
import { descriptionSchema, nameSchema } from "../common.js";

export const ASSET_TYPES = ["text", "integer", "boolean", "credential"] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export const ASSET_SCOPES = ["global", "per-user", "per-robot"] as const;
export type AssetScope = (typeof ASSET_SCOPES)[number];

const baseAssetFields = {
  name: nameSchema,
  description: descriptionSchema,
  scope: z.enum(ASSET_SCOPES).default("global"),
};

const textAssetSchema = z.object({
  ...baseAssetFields,
  type: z.literal("text"),
  value: z.string(),
});

const integerAssetSchema = z.object({
  ...baseAssetFields,
  type: z.literal("integer"),
  value: z.number().int(),
});

const booleanAssetSchema = z.object({
  ...baseAssetFields,
  type: z.literal("boolean"),
  value: z.boolean(),
});

const credentialAssetSchema = z.object({
  ...baseAssetFields,
  type: z.literal("credential"),
  value: nameSchema,
});

export const assetSchema = z.discriminatedUnion("type", [
  textAssetSchema,
  integerAssetSchema,
  booleanAssetSchema,
  credentialAssetSchema,
]);

export type Asset = z.infer<typeof assetSchema>;

export const assetsSchema = z.array(assetSchema).superRefine((items, ctx) => {
  const seen = new Set<string>();
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (item === undefined) continue;
    if (seen.has(item.name)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [i, "name"],
        message: `duplicate asset name: '${item.name}'`,
      });
    }
    seen.add(item.name);
  }
});

export type Assets = z.infer<typeof assetsSchema>;
