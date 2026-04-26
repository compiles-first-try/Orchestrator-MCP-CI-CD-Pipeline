import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import {
  decryptSecret,
  encryptSecret,
  OrchestratorEncryptionError,
  parseEncryptionKey,
} from "../src/index.js";

const validKey = randomBytes(32).toString("base64");

describe("parseEncryptionKey", () => {
  it("returns a 32-byte buffer for a valid base64 key", () => {
    const buffer = parseEncryptionKey(validKey);
    expect(buffer.length).toBe(32);
  });

  it("rejects empty input", () => {
    expect(() => parseEncryptionKey("")).toThrow(OrchestratorEncryptionError);
  });

  it("rejects non-string input", () => {
    expect(() => parseEncryptionKey(undefined as unknown as string)).toThrow(
      OrchestratorEncryptionError,
    );
  });

  it("rejects keys that decode to wrong length", () => {
    const tooShort = Buffer.alloc(16).toString("base64");
    expect(() => parseEncryptionKey(tooShort)).toThrow(OrchestratorEncryptionError);
  });
});

describe("encrypt/decrypt round-trip", () => {
  it("returns the original plaintext", () => {
    const key = parseEncryptionKey(validKey);
    const envelope = encryptSecret("super-secret", key);
    expect(decryptSecret(envelope, key)).toBe("super-secret");
  });

  it("produces different envelopes for the same plaintext (random IV)", () => {
    const key = parseEncryptionKey(validKey);
    const a = encryptSecret("hello", key);
    const b = encryptSecret("hello", key);
    expect(a).not.toBe(b);
  });

  it("rejects decryption with the wrong key", () => {
    const key1 = parseEncryptionKey(validKey);
    const key2 = parseEncryptionKey(randomBytes(32).toString("base64"));
    const envelope = encryptSecret("plain", key1);
    expect(() => decryptSecret(envelope, key2)).toThrow(OrchestratorEncryptionError);
  });

  it("rejects tampered envelopes (auth tag verification)", () => {
    const key = parseEncryptionKey(validKey);
    const envelope = encryptSecret("plain", key);
    const buffer = Buffer.from(envelope, "base64");
    const lastIndex = buffer.length - 1;
    const lastByte = buffer[lastIndex];
    if (lastByte === undefined) throw new Error("unexpected empty buffer");
    buffer[lastIndex] = lastByte ^ 0xff;
    const tampered = buffer.toString("base64");
    expect(() => decryptSecret(tampered, key)).toThrow(OrchestratorEncryptionError);
  });

  it("rejects envelopes that are too short to contain IV+tag", () => {
    const key = parseEncryptionKey(validKey);
    const tooShort = Buffer.alloc(8).toString("base64");
    expect(() => decryptSecret(tooShort, key)).toThrow(OrchestratorEncryptionError);
  });

  it("rejects encrypt with wrong-sized key buffer", () => {
    const badKey = Buffer.alloc(16);
    expect(() => encryptSecret("x", badKey)).toThrow(OrchestratorEncryptionError);
  });

  it("rejects decrypt with wrong-sized key buffer", () => {
    const badKey = Buffer.alloc(16);
    expect(() => decryptSecret("AAAA", badKey)).toThrow(OrchestratorEncryptionError);
  });
});
