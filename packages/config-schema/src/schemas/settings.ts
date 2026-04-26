import { z } from "zod";
import { NAME_PATTERN } from "../common.js";

const scalarSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const settingValueSchema: z.ZodType<SettingValue> = z.lazy(() =>
  z.union([scalarSchema, z.array(settingValueSchema), z.record(settingValueSchema)]),
);

export type SettingValue =
  | string
  | number
  | boolean
  | null
  | readonly SettingValue[]
  | { readonly [key: string]: SettingValue };

export const settingsSchema = z
  .record(settingValueSchema)
  .refine(
    (record) => Object.keys(record).every((key) => NAME_PATTERN.test(key)),
    "setting keys must start with a letter and use only letters, digits, '-', or '_' (max 64 chars)",
  );

export type Settings = z.infer<typeof settingsSchema>;
