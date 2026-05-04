import { createHmac, timingSafeEqual } from "node:crypto";
import { GithubWebhookSignatureError } from "./errors.js";

// GitHub signs webhook payloads with HMAC-SHA256(secret, body) and sends the
// hex digest in the `X-Hub-Signature-256` header as `sha256=<hex>`. We
// recompute and compare in constant time. A mismatch raises
// GithubWebhookSignatureError so route handlers can short-circuit with 401.
//
// Reference: https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
export function verifyWebhookSignature(args: {
  body: string | Buffer;
  signatureHeader: string | undefined;
  secret: string;
}): void {
  if (args.signatureHeader === undefined || args.signatureHeader === "") {
    throw new GithubWebhookSignatureError("Missing X-Hub-Signature-256 header.");
  }
  const expected = computeSignature(args.body, args.secret);
  const expectedBytes = Buffer.from(expected, "utf8");
  const actualBytes = Buffer.from(args.signatureHeader, "utf8");
  if (expectedBytes.byteLength !== actualBytes.byteLength) {
    throw new GithubWebhookSignatureError("Webhook signature length mismatch.");
  }
  if (!timingSafeEqual(expectedBytes, actualBytes)) {
    throw new GithubWebhookSignatureError("Webhook signature does not match.");
  }
}

export function computeSignature(body: string | Buffer, secret: string): string {
  const hmac = createHmac("sha256", secret);
  hmac.update(body);
  return `sha256=${hmac.digest("hex")}`;
}
