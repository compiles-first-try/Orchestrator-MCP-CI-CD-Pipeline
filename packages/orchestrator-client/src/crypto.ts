import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { OrchestratorEncryptionError } from "./errors.js";

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

export function parseEncryptionKey(base64Key: string): Buffer {
  if (typeof base64Key !== "string" || base64Key.length === 0) {
    throw new OrchestratorEncryptionError("encryption key is missing");
  }
  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64Key, "base64");
  } catch {
    throw new OrchestratorEncryptionError("encryption key is not valid base64");
  }
  if (buffer.length !== KEY_BYTES) {
    throw new OrchestratorEncryptionError(
      `encryption key must decode to ${KEY_BYTES} bytes (got ${buffer.length})`,
    );
  }
  return buffer;
}

export function encryptSecret(plaintext: string, key: Buffer): string {
  if (key.length !== KEY_BYTES) {
    throw new OrchestratorEncryptionError(`key length must be ${KEY_BYTES} bytes`);
  }
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, ciphertext, tag]).toString("base64");
}

export function decryptSecret(envelope: string, key: Buffer): string {
  if (key.length !== KEY_BYTES) {
    throw new OrchestratorEncryptionError(`key length must be ${KEY_BYTES} bytes`);
  }
  const buffer = Buffer.from(envelope, "base64");
  if (buffer.length < IV_BYTES + TAG_BYTES + 1) {
    throw new OrchestratorEncryptionError("ciphertext envelope is too short");
  }
  const iv = buffer.subarray(0, IV_BYTES);
  const tag = buffer.subarray(buffer.length - TAG_BYTES);
  const ciphertext = buffer.subarray(IV_BYTES, buffer.length - TAG_BYTES);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  try {
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString("utf8");
  } catch (cause) {
    throw new OrchestratorEncryptionError("authentication tag verification failed", { cause });
  }
}
