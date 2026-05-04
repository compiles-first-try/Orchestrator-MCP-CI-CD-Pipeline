import { vi } from "vitest";
import type { TokenSource } from "../src/rest-client.js";

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

export function textResponse(body: string, status: number): Response {
  return new Response(body, { status, headers: { "Content-Type": "text/plain" } });
}

export function emptyResponse(status: number): Response {
  return new Response(null, { status });
}

// Stub token source. Returns a fixed token without ever hitting the network.
export function stubTokenSource(token = "stub-token", tokenType = "Bearer"): TokenSource {
  return {
    getToken: vi.fn(async () => ({ token, tokenType })),
  };
}
