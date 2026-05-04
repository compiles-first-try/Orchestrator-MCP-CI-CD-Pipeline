import { RpaPlatformError, type RpaPlatformErrorOptions } from "@rpa-platform/shared";

export class OrchestratorAuthError extends RpaPlatformError {
  constructor(message: string, options: RpaPlatformErrorOptions = {}) {
    super("orchestrator.auth_failed", message, options);
  }
}

export class OrchestratorTransportError extends RpaPlatformError {
  constructor(message: string, options: RpaPlatformErrorOptions = {}) {
    super("orchestrator.transport_failed", message, options);
  }
}

export class OrchestratorRequestError extends RpaPlatformError {
  public readonly status: number;

  constructor(status: number, message: string, options: RpaPlatformErrorOptions = {}) {
    super(`orchestrator.request_failed.${status}`, message, options);
    this.status = status;
  }
}
