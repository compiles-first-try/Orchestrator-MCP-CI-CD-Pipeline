import type { TenantName } from "@rpa-platform/shared";

export interface CredentialKey {
  readonly projectId: string;
  readonly tenant: TenantName;
  readonly name: string;
}

export interface CredentialSetParams extends CredentialKey {
  readonly value: string;
  readonly setByUserId: string;
}

export interface CredentialSource {
  readonly type: "manual" | "aws";
  getValue(key: CredentialKey): Promise<string>;
  setValue(params: CredentialSetParams): Promise<void>;
  listNames(scope: { projectId: string; tenant: TenantName }): Promise<readonly string[]>;
  delete(key: CredentialKey): Promise<void>;
}
