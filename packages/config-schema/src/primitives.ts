import { z } from "zod";

// Names allowed in Orchestrator entities. Conservative pattern: alphanumerics,
// underscore, dash, dot. No spaces. ASSUMPTION: tighter than Orchestrator's
// own validation; chosen to keep hand-edited Git config readable and
// diff-friendly. Verify against Orchestrator's actual constraints before
// final acceptance.
export const NameString = z
  .string()
  .min(1, "name is required")
  .max(256, "name must be 256 characters or fewer")
  .regex(/^[A-Za-z0-9_.-]+$/u, "name may only contain letters, digits, underscore, dash, dot");

export const DescriptionString = z.string().max(1024, "description must be 1024 characters or fewer");

export const TagString = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_.-]+$/u, "tags may only contain letters, digits, underscore, dash, dot");

export const TagList = z.array(TagString).max(32);

// File-level wrapper for forward-compat. Every config file has `schemaVersion`
// so that future schema evolutions can be detected without ambiguity.
export const SCHEMA_VERSION = 1;

export const SchemaVersionField = z.literal(SCHEMA_VERSION);

export type NameString = z.infer<typeof NameString>;
