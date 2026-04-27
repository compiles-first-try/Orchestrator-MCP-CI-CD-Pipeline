import { RpaPlatformError, type RpaPlatformErrorOptions } from "@rpa-platform/shared";

export class GitHubApiError extends RpaPlatformError {
  public readonly status: number;
  constructor(status: number, reason: string, options: RpaPlatformErrorOptions = {}) {
    super("github.api.error", `GitHub API error (HTTP ${status}): ${reason}.`, {
      ...options,
      details: { ...(options.details ?? {}), status },
    });
    this.status = status;
  }
}

export class GitHubTransportError extends RpaPlatformError {
  constructor(reason: string, options: RpaPlatformErrorOptions = {}) {
    super("github.transport.failed", `GitHub transport error: ${reason}.`, options);
  }
}
