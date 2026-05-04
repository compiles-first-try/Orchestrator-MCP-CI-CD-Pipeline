import { z } from "zod";
import { SchemaVersionField } from "./primitives.js";

// REFramework `Settings` are arbitrary key → typed-value pairs the framework
// reads at runtime (queue name, retry counts, alert email, etc.). Keys are
// developer-defined; the platform does not curate the catalogue.
//
// ASSUMPTION: Allowed value types mirror Orchestrator Asset value types we
// support: text, integer, bool. No nested objects, no arrays, no nulls. This
// keeps the legacy Excel round-trip lossless (Excel cells are scalar) and
// matches the JSON-ready REFramework's reader. Verify against §6 if/when the
// spec is paste-able.
export const SettingValue = z.union([z.string(), z.number().finite(), z.boolean()]);

export type SettingValue = z.infer<typeof SettingValue>;

export const SettingsRecord = z.record(z.string().min(1), SettingValue);

export const SettingsFile = z.object({
  schemaVersion: SchemaVersionField,
  settings: SettingsRecord,
});

export type SettingsFile = z.infer<typeof SettingsFile>;
