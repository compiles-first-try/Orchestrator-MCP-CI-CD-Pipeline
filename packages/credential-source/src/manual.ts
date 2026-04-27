import { decryptSecret, encryptSecret, type TenantName } from "@rpa-platform/shared";
import { CredentialNotFoundError } from "./errors.js";
import type { CredentialStore } from "./store.js";
import type { CredentialKey, CredentialSetParams, CredentialSource } from "./types.js";

export interface ManualCredentialSourceConfig {
  readonly store: CredentialStore;
  readonly encryptionKey: Buffer;
}

export class ManualCredentialSource implements CredentialSource {
  public readonly type = "manual" as const;

  constructor(private readonly config: ManualCredentialSourceConfig) {}

  async getValue(key: CredentialKey): Promise<string> {
    const row = await this.config.store.read(key);
    if (row === undefined) {
      throw new CredentialNotFoundError(key.projectId, key.tenant, key.name);
    }
    return decryptSecret(row.valueEncrypted, this.config.encryptionKey);
  }

  async setValue(params: CredentialSetParams): Promise<void> {
    const valueEncrypted = encryptSecret(params.value, this.config.encryptionKey);
    await this.config.store.upsert({
      projectId: params.projectId,
      tenant: params.tenant,
      name: params.name,
      valueEncrypted,
      setByUserId: params.setByUserId,
    });
  }

  async listNames(scope: { projectId: string; tenant: TenantName }): Promise<readonly string[]> {
    return this.config.store.list(scope);
  }

  async delete(key: CredentialKey): Promise<void> {
    await this.config.store.remove(key);
  }
}
