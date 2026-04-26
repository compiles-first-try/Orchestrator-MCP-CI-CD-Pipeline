import { RpaPlatformError, type RpaPlatformErrorOptions } from "@rpa-platform/shared";
import type { ZodIssue } from "zod";

export interface ConfigSchemaErrorOptions extends RpaPlatformErrorOptions {
  issues?: readonly ZodIssue[];
}

export class ConfigSchemaError extends RpaPlatformError {
  public readonly issues: readonly ZodIssue[];

  constructor(file: string, options: ConfigSchemaErrorOptions = {}) {
    const issues = options.issues ?? [];
    const summary =
      issues.length === 0
        ? `Invalid ${file}.`
        : `Invalid ${file}: ${issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")}.`;
    super("config_schema.invalid", summary, {
      ...options,
      details: { ...(options.details ?? {}), file, issues },
    });
    this.issues = issues;
  }
}
