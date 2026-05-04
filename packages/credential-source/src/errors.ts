import { RpaPlatformError, type RpaPlatformErrorOptions } from "@rpa-platform/shared";

export class CredentialNotFoundError extends RpaPlatformError {
  public readonly secretRef: string;
  constructor(secretRef: string, options: RpaPlatformErrorOptions = {}) {
    super("credential.not_found", `No credential value stored for secretRef '${secretRef}'.`, options);
    this.secretRef = secretRef;
  }
}

export class CredentialMalformedError extends RpaPlatformError {
  constructor(message: string, options: RpaPlatformErrorOptions = {}) {
    super("credential.malformed", message, options);
  }
}
