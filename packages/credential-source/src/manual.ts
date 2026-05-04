import { decryptSecret, encryptSecret } from "@rpa-platform/shared";
import { CredentialMalformedError, CredentialNotFoundError } from "./errors.js";
import { CredentialValue, type CredentialSource, type ManualSecretStore } from "./types.js";

// Manual credential-source: secrets live in our own DB, encrypted at rest
// with AES-256-GCM. The encrypted blob serialises a JSON
// `{ username?, password }` payload — the same shape AWS Secrets Manager
// returns when storing username+password pairs, so the v2 AWS implementation
// can hand back the same `CredentialValue` without callers caring which
// source produced it.
export class ManualCredentialSource implements CredentialSource {
  public readonly kind = "manual" as const;

  readonly #store: ManualSecretStore;
  readonly #encryptionKey: Buffer;

  constructor(store: ManualSecretStore, encryptionKey: Buffer) {
    this.#store = store;
    this.#encryptionKey = encryptionKey;
  }

  async resolve(secretRef: string): Promise<CredentialValue> {
    const encrypted = await this.#store.read(secretRef);
    if (encrypted === null) {
      throw new CredentialNotFoundError(secretRef);
    }
    const json = decryptSecret(encrypted, this.#encryptionKey);
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (cause) {
      throw new CredentialMalformedError(
        `Stored credential for secretRef '${secretRef}' did not decode to JSON.`,
        { cause },
      );
    }
    const result = CredentialValue.safeParse(parsed);
    if (!result.success) {
      throw new CredentialMalformedError(
        `Stored credential for secretRef '${secretRef}' did not match the expected shape.`,
        { details: { issues: result.error.issues } },
      );
    }
    return result.data;
  }

  async store(secretRef: string, value: CredentialValue): Promise<void> {
    const validated = CredentialValue.parse(value);
    const encrypted = encryptSecret(JSON.stringify(validated), this.#encryptionKey);
    await this.#store.write(secretRef, encrypted);
  }

  async remove(secretRef: string): Promise<void> {
    await this.#store.remove(secretRef);
  }
}
