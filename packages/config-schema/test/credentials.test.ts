import { describe, expect, it } from "vitest";
import { CredentialsFile } from "../src/credentials.js";

describe("CredentialsFile", () => {
  it("accepts a manual-source credential with default kind 'credential'", () => {
    const result = CredentialsFile.parse({
      schemaVersion: 1,
      credentials: [
        {
          name: "DbPassword",
          username: "service",
          secretSource: "manual",
          secretRef: "manual-key-1",
        },
      ],
    });
    expect(result.credentials[0]?.kind).toBe("credential");
  });

  it("accepts a windowsCredential kind", () => {
    const result = CredentialsFile.safeParse({
      schemaVersion: 1,
      credentials: [
        {
          name: "WindowsLogin",
          kind: "windowsCredential",
          secretSource: "manual",
          secretRef: "manual-key-2",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown secretSource", () => {
    const result = CredentialsFile.safeParse({
      schemaVersion: 1,
      credentials: [
        {
          name: "BadSource",
          secretSource: "vault",
          secretRef: "x",
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("flags duplicate credential names", () => {
    const result = CredentialsFile.safeParse({
      schemaVersion: 1,
      credentials: [
        { name: "Same", secretSource: "manual", secretRef: "a" },
        { name: "Same", secretSource: "manual", secretRef: "b" },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes("duplicate credential name"))).toBe(true);
    }
  });

  it("rejects an empty secretRef", () => {
    const result = CredentialsFile.safeParse({
      schemaVersion: 1,
      credentials: [{ name: "Empty", secretSource: "manual", secretRef: "" }],
    });
    expect(result.success).toBe(false);
  });
});
