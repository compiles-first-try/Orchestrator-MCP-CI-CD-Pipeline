import { RpaPlatformError, type RpaPlatformErrorOptions } from "@rpa-platform/shared";

export class OrchestratorAuthError extends RpaPlatformError {
  constructor(reason: string, options: RpaPlatformErrorOptions = {}) {
    super("orchestrator.auth.unauthorized", `OAuth2 authorization failed: ${reason}.`, options);
  }
}

export class OrchestratorTransportError extends RpaPlatformError {
  constructor(reason: string, options: RpaPlatformErrorOptions = {}) {
    super("orchestrator.transport.failed", `Orchestrator transport error: ${reason}.`, options);
  }
}

export class OrchestratorApiError extends RpaPlatformError {
  public readonly status: number;
  constructor(status: number, body: string, options: RpaPlatformErrorOptions = {}) {
    super("orchestrator.api.error", `Orchestrator returned HTTP ${status}: ${body.slice(0, 256)}`, {
      ...options,
      details: { ...(options.details ?? {}), status, body },
    });
    this.status = status;
  }
}
