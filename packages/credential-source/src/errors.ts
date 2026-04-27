import { RpaPlatformError, type RpaPlatformErrorOptions } from "@rpa-platform/shared";
import type { TenantName } from "@rpa-platform/shared";

export class CredentialNotFoundError extends RpaPlatformError {
  constructor(
    projectId: string,
    tenant: TenantName,
    name: string,
    options: RpaPlatformErrorOptions = {},
  ) {
    super(
      "credential.not_found",
      `Credential '${name}' for project ${projectId} on tenant '${tenant}' is not set.`,
      {
        ...options,
        details: { ...(options.details ?? {}), projectId, tenant, name },
      },
    );
  }
}
