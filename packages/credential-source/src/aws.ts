import { NotImplementedError, type TenantName } from "@rpa-platform/shared";
import type { CredentialKey, CredentialSetParams, CredentialSource } from "./types.js";

export interface AwsCredentialSourceConfig {
  readonly region: string;
  readonly secretPrefix: string;
}

// v2 stub. AWS Secrets Manager integration is intentionally out of scope for v1
// per CLAUDE.md ("Scope discipline"). The shape is here so that the credential
// source slot in the reconciler is pluggable; replacing this with a real
// implementation later is mechanical.
export class AwsCredentialSource implements CredentialSource {
  public readonly type = "aws" as const;

  constructor(_config: AwsCredentialSourceConfig) {}

  async getValue(_key: CredentialKey): Promise<string> {
    throw new NotImplementedError("AwsCredentialSource.getValue");
  }

  async setValue(_params: CredentialSetParams): Promise<void> {
    throw new NotImplementedError("AwsCredentialSource.setValue");
  }

  async listNames(_scope: { projectId: string; tenant: TenantName }): Promise<readonly string[]> {
    throw new NotImplementedError("AwsCredentialSource.listNames");
  }

  async delete(_key: CredentialKey): Promise<void> {
    throw new NotImplementedError("AwsCredentialSource.delete");
  }
}
