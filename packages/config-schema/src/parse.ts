import { RpaPlatformError } from "@rpa-platform/shared";
import type { ZodIssue, ZodTypeAny, infer as zinfer } from "zod";

export interface ParseConfigOptions {
  /** Used in the error message and audit trail. e.g. "assets.json". */
  readonly source: string;
  /** Optional correlation id, propagated into the thrown error. */
  readonly correlationId?: string;
}

export class ConfigSchemaError extends RpaPlatformError {
  public readonly source: string;
  public readonly issues: readonly ZodIssue[];

  constructor(source: string, issues: readonly ZodIssue[], correlationId?: string) {
    super("config.schema_invalid", buildMessage(source, issues), {
      ...(correlationId !== undefined && { correlationId }),
      details: { source, issues },
    });
    this.source = source;
    this.issues = issues;
  }
}

function buildMessage(source: string, issues: readonly ZodIssue[]): string {
  const lines = issues.map((issue) => {
    const path = issue.path.length === 0 ? "(root)" : issue.path.join(".");
    return `  - ${path}: ${issue.message}`;
  });
  return `${source} failed schema validation:\n${lines.join("\n")}`;
}

export function parseConfig<S extends ZodTypeAny>(
  schema: S,
  data: unknown,
  options: ParseConfigOptions,
): zinfer<S> {
  const result = schema.safeParse(data);
  if (result.success) {
    return result.data;
  }
  throw new ConfigSchemaError(options.source, result.error.issues, options.correlationId);
}
