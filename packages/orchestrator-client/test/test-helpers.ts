import { randomBytes } from "node:crypto";
import { encryptSecret, parseEncryptionKey, TokenManager, type FetchFn } from "../src/index.js";

export const KEY = parseEncryptionKey(randomBytes(32).toString("base64"));

export interface RecordedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | Uint8Array | undefined;
}

export type MockResponder = (request: RecordedRequest) => Response | Promise<Response>;

export function mockOrchestrator(responder: MockResponder): {
  fetch: FetchFn;
  recorded: RecordedRequest[];
} {
  const recorded: RecordedRequest[] = [];
  const fetch: FetchFn = async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    const headers: Record<string, string> = {};
    const rawHeaders = (init?.headers ?? {}) as Record<string, string>;
    for (const [key, value] of Object.entries(rawHeaders)) headers[key] = value;
    let bodyValue: string | Uint8Array | undefined;
    if (typeof init?.body === "string") bodyValue = init.body;
    else if (init?.body instanceof Uint8Array) bodyValue = init.body;
    const request: RecordedRequest = {
      url,
      method: init?.method ?? "GET",
      headers,
      body: bodyValue,
    };
    recorded.push(request);
    return responder(request);
  };
  return { fetch, recorded };
}

export function tokenResponse(): Response {
  return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 });
}

export function makeTokenManager(fetch: FetchFn): TokenManager {
  return new TokenManager({
    tokenUrl: "https://orch.example/identity_/connect/token",
    clientId: "client-abc",
    encryptedClientSecret: encryptSecret("secret", KEY),
    scopes: ["OR.Default"],
    encryptionKey: KEY,
    fetch,
  });
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
