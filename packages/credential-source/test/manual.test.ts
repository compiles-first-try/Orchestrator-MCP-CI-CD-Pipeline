import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, parseEncryptionKey, type TenantName } from "@rpa-platform/shared";
import {
  CredentialNotFoundError,
  ManualCredentialSource,
  type CredentialStore,
  type CredentialStoreWriteParams,
} from "../src/index.js";

const KEY = parseEncryptionKey(randomBytes(32).toString("base64"));

interface FakeStore extends CredentialStore {
  upserts: CredentialStoreWriteParams[];
  removes: { projectId: string; tenant: TenantName; name: string }[];
  rows: Map<string, string>;
}

function makeStore(seed: Record<string, string> = {}): FakeStore {
  const rows = new Map(Object.entries(seed));
  const upserts: CredentialStoreWriteParams[] = [];
  const removes: { projectId: string; tenant: TenantName; name: string }[] = [];
  const keyOf = (projectId: string, tenant: string, name: string) =>
    `${projectId}::${tenant}::${name}`;
  return {
    upserts,
    removes,
    rows,
    async read(key) {
      const v = rows.get(keyOf(key.projectId, key.tenant, key.name));
      return v === undefined ? undefined : { valueEncrypted: v };
    },
    async upsert(params) {
      upserts.push(params);
      rows.set(keyOf(params.projectId, params.tenant, params.name), params.valueEncrypted);
    },
    async list(scope) {
      const prefix = `${scope.projectId}::${scope.tenant}::`;
      return Array.from(rows.keys())
        .filter((k) => k.startsWith(prefix))
        .map((k) => k.slice(prefix.length));
    },
    async remove(key) {
      removes.push(key);
      rows.delete(keyOf(key.projectId, key.tenant, key.name));
    },
  };
}

describe("ManualCredentialSource", () => {
  it("setValue encrypts before writing to the store", async () => {
    const store = makeStore();
    const source = new ManualCredentialSource({ store, encryptionKey: KEY });
    await source.setValue({
      projectId: "proj-1",
      tenant: "dev",
      name: "ServiceAccount",
      value: "shh",
      setByUserId: "user-1",
    });
    expect(store.upserts).toHaveLength(1);
    const written = store.upserts[0];
    expect(written?.valueEncrypted).not.toBe("shh");
    expect(decryptSecret(written?.valueEncrypted ?? "", KEY)).toBe("shh");
  });

  it("getValue decrypts what's in the store", async () => {
    const store = makeStore();
    const source = new ManualCredentialSource({ store, encryptionKey: KEY });
    await source.setValue({
      projectId: "proj-1",
      tenant: "dev",
      name: "ServiceAccount",
      value: "shh",
      setByUserId: "user-1",
    });
    const v = await source.getValue({
      projectId: "proj-1",
      tenant: "dev",
      name: "ServiceAccount",
    });
    expect(v).toBe("shh");
  });

  it("getValue throws CredentialNotFoundError when missing", async () => {
    const store = makeStore();
    const source = new ManualCredentialSource({ store, encryptionKey: KEY });
    await expect(
      source.getValue({ projectId: "proj-1", tenant: "dev", name: "Missing" }),
    ).rejects.toBeInstanceOf(CredentialNotFoundError);
  });

  it("listNames returns names scoped to project + tenant", async () => {
    const store = makeStore();
    const source = new ManualCredentialSource({ store, encryptionKey: KEY });
    await source.setValue({
      projectId: "proj-1",
      tenant: "dev",
      name: "A",
      value: "1",
      setByUserId: "u",
    });
    await source.setValue({
      projectId: "proj-1",
      tenant: "dev",
      name: "B",
      value: "2",
      setByUserId: "u",
    });
    await source.setValue({
      projectId: "proj-1",
      tenant: "test",
      name: "C",
      value: "3",
      setByUserId: "u",
    });
    const names = await source.listNames({ projectId: "proj-1", tenant: "dev" });
    expect([...names].sort()).toEqual(["A", "B"]);
  });

  it("delete removes the entry", async () => {
    const store = makeStore();
    const source = new ManualCredentialSource({ store, encryptionKey: KEY });
    await source.setValue({
      projectId: "proj-1",
      tenant: "dev",
      name: "A",
      value: "1",
      setByUserId: "u",
    });
    await source.delete({ projectId: "proj-1", tenant: "dev", name: "A" });
    expect(store.removes).toHaveLength(1);
    await expect(
      source.getValue({ projectId: "proj-1", tenant: "dev", name: "A" }),
    ).rejects.toBeInstanceOf(CredentialNotFoundError);
  });

  it("type discriminator is 'manual'", () => {
    const source = new ManualCredentialSource({ store: makeStore(), encryptionKey: KEY });
    expect(source.type).toBe("manual");
  });

  it("CredentialNotFoundError carries the spec audit code", async () => {
    const source = new ManualCredentialSource({ store: makeStore(), encryptionKey: KEY });
    try {
      await source.getValue({ projectId: "p", tenant: "dev", name: "x" });
      expect.fail("expected throw");
    } catch (err) {
      expect((err as CredentialNotFoundError).code).toBe("credential.not_found");
    }
  });
});
