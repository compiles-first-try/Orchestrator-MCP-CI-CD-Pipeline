import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CredentialMalformedError, CredentialNotFoundError, ManualCredentialSource } from "../src/index.js";
import type { ManualSecretStore } from "../src/types.js";

class MemoryStore implements ManualSecretStore {
  readonly map = new Map<string, string>();
  async read(secretRef: string): Promise<string | null> {
    return this.map.get(secretRef) ?? null;
  }
  async write(secretRef: string, encrypted: string): Promise<void> {
    this.map.set(secretRef, encrypted);
  }
  async remove(secretRef: string): Promise<void> {
    this.map.delete(secretRef);
  }
}

describe("ManualCredentialSource", () => {
  const KEY = randomBytes(32);

  it("round-trips a credential through store + resolve", async () => {
    const source = new ManualCredentialSource(new MemoryStore(), KEY);
    await source.store("project/dev/db-password", { username: "service", password: "p@ss" });
    const value = await source.resolve("project/dev/db-password");
    expect(value).toEqual({ username: "service", password: "p@ss" });
  });

  it("throws CredentialNotFoundError for an unknown secretRef", async () => {
    const source = new ManualCredentialSource(new MemoryStore(), KEY);
    await expect(source.resolve("nothing-here")).rejects.toBeInstanceOf(CredentialNotFoundError);
  });

  it("throws CredentialMalformedError when the stored ciphertext decodes to non-JSON", async () => {
    const store = new MemoryStore();
    const source = new ManualCredentialSource(store, KEY);
    // Manually inject a malformed (but decryptable) blob.
    const { encryptSecret } = await import("@rpa-platform/shared");
    store.map.set("bad", encryptSecret("this is not json", KEY));
    await expect(source.resolve("bad")).rejects.toBeInstanceOf(CredentialMalformedError);
  });

  it("throws CredentialMalformedError when the JSON does not match the expected shape", async () => {
    const store = new MemoryStore();
    const source = new ManualCredentialSource(store, KEY);
    const { encryptSecret } = await import("@rpa-platform/shared");
    store.map.set("missing-password", encryptSecret(JSON.stringify({ username: "x" }), KEY));
    await expect(source.resolve("missing-password")).rejects.toBeInstanceOf(CredentialMalformedError);
  });

  it("supports password-only credentials (username omitted)", async () => {
    const source = new ManualCredentialSource(new MemoryStore(), KEY);
    await source.store("api-key", { password: "sk_live_abcdef" });
    const v = await source.resolve("api-key");
    expect(v.password).toBe("sk_live_abcdef");
    expect(v.username).toBeUndefined();
  });

  it("remove() deletes the entry", async () => {
    const source = new ManualCredentialSource(new MemoryStore(), KEY);
    await source.store("x", { password: "p" });
    await source.remove("x");
    await expect(source.resolve("x")).rejects.toBeInstanceOf(CredentialNotFoundError);
  });
});
