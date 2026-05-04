import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { GithubWebhookSignatureError, computeSignature, verifyWebhookSignature } from "../src/webhooks.js";

const SECRET = "my-webhook-secret";
const BODY = JSON.stringify({ action: "opened", number: 1 });

describe("computeSignature", () => {
  it("matches the documented HMAC-SHA256 hex digest format", () => {
    const expected = `sha256=${createHmac("sha256", SECRET).update(BODY).digest("hex")}`;
    expect(computeSignature(BODY, SECRET)).toBe(expected);
  });
});

describe("verifyWebhookSignature", () => {
  it("accepts a valid signature", () => {
    const sig = computeSignature(BODY, SECRET);
    expect(() => verifyWebhookSignature({ body: BODY, signatureHeader: sig, secret: SECRET })).not.toThrow();
  });

  it("rejects a signature computed with the wrong secret", () => {
    const sig = computeSignature(BODY, "wrong-secret");
    expect(() =>
      verifyWebhookSignature({ body: BODY, signatureHeader: sig, secret: SECRET }),
    ).toThrow(GithubWebhookSignatureError);
  });

  it("rejects a signature computed over a different body", () => {
    const sig = computeSignature("different body", SECRET);
    expect(() =>
      verifyWebhookSignature({ body: BODY, signatureHeader: sig, secret: SECRET }),
    ).toThrow(GithubWebhookSignatureError);
  });

  it("rejects when the header is missing", () => {
    expect(() =>
      verifyWebhookSignature({ body: BODY, signatureHeader: undefined, secret: SECRET }),
    ).toThrow(GithubWebhookSignatureError);
  });

  it("rejects a header of the wrong length", () => {
    expect(() =>
      verifyWebhookSignature({ body: BODY, signatureHeader: "sha256=short", secret: SECRET }),
    ).toThrow(GithubWebhookSignatureError);
  });

  it("supports a Buffer body", () => {
    const buf = Buffer.from(BODY, "utf8");
    const sig = computeSignature(buf, SECRET);
    expect(() => verifyWebhookSignature({ body: buf, signatureHeader: sig, secret: SECRET })).not.toThrow();
  });
});
