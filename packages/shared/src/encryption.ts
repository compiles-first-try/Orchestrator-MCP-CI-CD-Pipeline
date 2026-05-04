import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";
import { RpaPlatformError, type RpaPlatformErrorOptions } from "./errors.js";

// AES-256-GCM. We persist the encrypted blob as a single text column in
// Postgres (`oauth_client_secret_encrypted text`, plus future
// `credential_values.value_encrypted text`). The on-the-wire format is:
//
//   v1.<iv-base64>.<authTag-base64>.<ciphertext-base64>
//
// `v1` is a version prefix so the algorithm or layout can change later
// without a destructive migration — decrypt picks the parser from the prefix.
const FORMAT_VERSION = "v1" as const;
const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32; // 256 bits
const IV_BYTES = 12; // GCM standard
const TAG_BYTES = 16; // GCM auth tag

export class EncryptionError extends RpaPlatformError {
  constructor(message: string, options: RpaPlatformErrorOptions = {}) {
    super("encryption.failed", message, options);
  }
}

export class EncryptionKeyError extends RpaPlatformError {
  constructor(message: string, options: RpaPlatformErrorOptions = {}) {
    super("encryption.key_invalid", message, options);
  }
}

// Decode the base64-encoded encryption key from PLATFORM_ENCRYPTION_KEY.
// Throws EncryptionKeyError if the key is missing, malformed, or not 32 bytes.
export function loadEncryptionKey(base64Key: string | undefined): Buffer {
  if (base64Key === undefined || base64Key === "") {
    throw new EncryptionKeyError(
      "PLATFORM_ENCRYPTION_KEY is not set. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\".",
    );
  }
  let decoded: Buffer;
  try {
    decoded = Buffer.from(base64Key, "base64");
  } catch (cause) {
    throw new EncryptionKeyError("PLATFORM_ENCRYPTION_KEY is not valid base64.", { cause });
  }
  if (decoded.byteLength !== KEY_BYTES) {
    throw new EncryptionKeyError(
      `PLATFORM_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes (256 bits); got ${decoded.byteLength}.`,
    );
  }
  return decoded;
}

export function encryptSecret(plaintext: string, key: Buffer): string {
  assertKey(key);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${FORMAT_VERSION}.${iv.toString("base64")}.${authTag.toString("base64")}.${ciphertext.toString("base64")}`;
}

export function decryptSecret(encoded: string, key: Buffer): string {
  assertKey(key);
  const parts = encoded.split(".");
  if (parts.length !== 4) {
    throw new EncryptionError("Encoded secret has wrong shape; expected 4 dot-separated parts.");
  }
  const [version, ivB64, tagB64, ctB64] = parts;
  if (version !== FORMAT_VERSION) {
    throw new EncryptionError(`Unsupported encrypted-secret format version '${version ?? ""}'.`);
  }
  if (ivB64 === undefined || tagB64 === undefined || ctB64 === undefined) {
    throw new EncryptionError("Encoded secret is missing iv, authTag, or ciphertext.");
  }
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const ciphertext = Buffer.from(ctB64, "base64");
  if (iv.byteLength !== IV_BYTES) {
    throw new EncryptionError(`IV is ${iv.byteLength} bytes; expected ${IV_BYTES}.`);
  }
  if (authTag.byteLength !== TAG_BYTES) {
    throw new EncryptionError(`Auth tag is ${authTag.byteLength} bytes; expected ${TAG_BYTES}.`);
  }
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  try {
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString("utf8");
  } catch (cause) {
    // GCM throws on tag mismatch — surface as our domain error so callers
    // get a `code` field instead of a low-level OpenSSL message.
    throw new EncryptionError("Decryption failed: ciphertext or auth tag is tampered, or wrong key.", {
      cause,
    });
  }
}

// Constant-time comparison helper exposed for callers that need to compare
// two ciphertexts (e.g. "did the secret change?") without leaking timing.
export function constantTimeEquals(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.byteLength !== bBuf.byteLength) return false;
  return timingSafeEqual(aBuf, bBuf);
}

function assertKey(key: Buffer): void {
  if (key.byteLength !== KEY_BYTES) {
    throw new EncryptionKeyError(`Encryption key must be ${KEY_BYTES} bytes; got ${key.byteLength}.`);
  }
}
