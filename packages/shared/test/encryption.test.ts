import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  EncryptionError,
  EncryptionKeyError,
  constantTimeEquals,
  decryptSecret,
  encryptSecret,
  loadEncryptionKey,
} from "../src/encryption.js";

const TEST_KEY = randomBytes(32);

describe("loadEncryptionKey", () => {
  it("decodes a valid base64 32-byte key", () => {
    const key = loadEncryptionKey(TEST_KEY.toString("base64"));
    expect(key.equals(TEST_KEY)).toBe(true);
  });

  it("throws when the env var is missing or empty", () => {
    expect(() => loadEncryptionKey(undefined)).toThrow(EncryptionKeyError);
    expect(() => loadEncryptionKey("")).toThrow(EncryptionKeyError);
  });

  it("throws when the decoded key is the wrong byte length", () => {
    const tooShort = randomBytes(16).toString("base64");
    expect(() => loadEncryptionKey(tooShort)).toThrow(EncryptionKeyError);
  });
});

describe("encryptSecret / decryptSecret round-trip", () => {
  it("round-trips arbitrary UTF-8 plaintext", () => {
    const plaintext = "client-secret-with-unicode-éñ💥-and-symbols-!@#";
    const encoded = encryptSecret(plaintext, TEST_KEY);
    expect(decryptSecret(encoded, TEST_KEY)).toBe(plaintext);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const plaintext = "same-input";
    const a = encryptSecret(plaintext, TEST_KEY);
    const b = encryptSecret(plaintext, TEST_KEY);
    expect(a).not.toBe(b);
  });

  it("uses the v1 format prefix", () => {
    const encoded = encryptSecret("hello", TEST_KEY);
    expect(encoded.startsWith("v1.")).toBe(true);
    expect(encoded.split(".")).toHaveLength(4);
  });
});

describe("decryptSecret error cases", () => {
  it("rejects a wrong key with EncryptionError", () => {
    const encoded = encryptSecret("hello", TEST_KEY);
    const wrongKey = randomBytes(32);
    expect(() => decryptSecret(encoded, wrongKey)).toThrow(EncryptionError);
  });

  it("rejects a tampered ciphertext", () => {
    const encoded = encryptSecret("hello world this is longer", TEST_KEY);
    const parts = encoded.split(".");
    expect(parts).toHaveLength(4);
    const ctBytes = Buffer.from(parts[3] ?? "", "base64");
    ctBytes[0] = (ctBytes[0] ?? 0) ^ 0xff;
    const tampered = [parts[0], parts[1], parts[2], ctBytes.toString("base64")].join(".");
    expect(() => decryptSecret(tampered, TEST_KEY)).toThrow(EncryptionError);
  });

  it("rejects a tampered auth tag", () => {
    const encoded = encryptSecret("hello", TEST_KEY);
    const parts = encoded.split(".");
    expect(parts).toHaveLength(4);
    const tagBytes = Buffer.from(parts[2] ?? "", "base64");
    tagBytes[0] = (tagBytes[0] ?? 0) ^ 0xff;
    const tampered = [parts[0], parts[1], tagBytes.toString("base64"), parts[3]].join(".");
    expect(() => decryptSecret(tampered, TEST_KEY)).toThrow(EncryptionError);
  });

  it("rejects a missing or extra dot-segment", () => {
    expect(() => decryptSecret("v1.only.three", TEST_KEY)).toThrow(EncryptionError);
    expect(() => decryptSecret("v1.a.b.c.d", TEST_KEY)).toThrow(EncryptionError);
  });

  it("rejects an unknown format version", () => {
    expect(() => decryptSecret("v9.iv.tag.ct", TEST_KEY)).toThrow(EncryptionError);
  });

  it("rejects an IV of wrong length", () => {
    // Hand-craft an encoded blob with a 4-byte IV.
    const fakeIv = Buffer.alloc(4).toString("base64");
    const fakeTag = Buffer.alloc(16).toString("base64");
    const fakeCt = Buffer.alloc(8).toString("base64");
    const encoded = `v1.${fakeIv}.${fakeTag}.${fakeCt}`;
    expect(() => decryptSecret(encoded, TEST_KEY)).toThrow(EncryptionError);
  });
});

describe("constantTimeEquals", () => {
  it("returns true for identical strings", () => {
    expect(constantTimeEquals("hello", "hello")).toBe(true);
  });

  it("returns false for different strings of the same length", () => {
    expect(constantTimeEquals("hello", "world")).toBe(false);
  });

  it("returns false for different lengths without throwing", () => {
    expect(constantTimeEquals("hi", "hello")).toBe(false);
  });
});
