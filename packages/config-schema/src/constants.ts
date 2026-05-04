import { z } from "zod";
import { SchemaVersionField } from "./primitives.js";
import { SettingValue } from "./settings.js";

// `Constants` share the value-shape of `Settings` but are conventionally
// values the framework treats as immutable for the duration of a run. The
// REFramework distinction is preserved so the dual-format Excel export keeps
// the two tabs separate. Reusing `SettingValue` keeps Excel round-trip
// symmetric.
export const ConstantsRecord = z.record(z.string().min(1), SettingValue);

export const ConstantsFile = z.object({
  schemaVersion: SchemaVersionField,
  constants: ConstantsRecord,
});

export type ConstantsFile = z.infer<typeof ConstantsFile>;
