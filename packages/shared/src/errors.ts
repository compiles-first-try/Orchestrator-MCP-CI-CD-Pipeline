export interface RpaPlatformErrorOptions {
  cause?: unknown;
  correlationId?: string;
  details?: Readonly<Record<string, unknown>>;
}

export class RpaPlatformError extends Error {
  public readonly code: string;
  public readonly correlationId: string | undefined;
  public readonly details: Readonly<Record<string, unknown>> | undefined;

  constructor(code: string, message: string, options: RpaPlatformErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.code = code;
    this.correlationId = options.correlationId;
    this.details = options.details;
  }
}

export class NotImplementedError extends RpaPlatformError {
  constructor(feature: string, options: RpaPlatformErrorOptions = {}) {
    super("not_implemented", `${feature} is not implemented in v1.`, options);
  }
}

export class PermissionDeniedError extends RpaPlatformError {
  constructor(permission: string, options: RpaPlatformErrorOptions = {}) {
    super("permission_denied", `Permission denied: ${permission}.`, options);
  }
}

export class TenantNotConnectedError extends RpaPlatformError {
  constructor(tenantName: string, project: string, options: RpaPlatformErrorOptions = {}) {
    super(
      "reconcile.blocked_unconfigured_tenant",
      `Tenant '${tenantName}' is not connected. Run /rpa tenant connect ${project} ${tenantName} to configure credentials.`,
      options,
    );
  }
}
