import { z } from "zod";
import { NAME_PATTERN } from "../common.js";

const assetValueOverrideSchema = z.object({
  value: z.union([z.string(), z.number(), z.boolean()]),
});

const assetOverridesSchema = z
  .record(assetValueOverrideSchema)
  .refine(
    (record) => Object.keys(record).every((key) => NAME_PATTERN.test(key)),
    "asset override keys must be valid asset names",
  );

export const overridesSchema = z.object({
  assets: assetOverridesSchema.optional(),
});

export type AssetValueOverride = z.infer<typeof assetValueOverrideSchema>;
export type Overrides = z.infer<typeof overridesSchema>;
