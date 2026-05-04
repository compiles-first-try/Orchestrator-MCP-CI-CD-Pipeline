import { RpaPlatformError, type RpaPlatformErrorOptions } from "@rpa-platform/shared";

export class GithubRequestError extends RpaPlatformError {
  public readonly status: number | undefined;
  constructor(message: string, status: number | undefined, options: RpaPlatformErrorOptions = {}) {
    super(`github.request_failed${status === undefined ? "" : `.${status}`}`, message, options);
    this.status = status;
  }
}

export class GithubWebhookSignatureError extends RpaPlatformError {
  constructor(message: string, options: RpaPlatformErrorOptions = {}) {
    super("github.webhook_signature_invalid", message, options);
  }
}
