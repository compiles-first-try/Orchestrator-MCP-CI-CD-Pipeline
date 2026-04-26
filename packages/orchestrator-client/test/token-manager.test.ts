import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import {
  encryptSecret,
  OrchestratorAuthError,
  OrchestratorTransportError,
  parseEncryptionKey,
  TokenManager,
  type FetchFn,
} from "../src/index.js";

interface FakeClock {
  now(): number;
  advance(ms: number): void;
}

function makeClock(start = 1_700_000_000_000): FakeClock {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

function fakeFetch(
  responder: (url: string, init: RequestInit) => Response,
  callLog: { calls: number },
): FetchFn {
  return (input: Parameters<FetchFn>[0], init?: Parameters<FetchFn>[1]) => {
    callLog.calls += 1;
    const url = typeof input === "string" ? input : input.toString();
    return Promise.resolve(responder(url, init ?? {}));
  };
}

const KEY = parseEncryptionKey(randomBytes(32).toString("base64"));

function makeManager(overrides: { fetch: FetchFn; clock?: FakeClock; refresh?: number }) {
  const encrypted = encryptSecret("the-secret", KEY);
  return new TokenManager({
    tokenUrl: "https://example/identity_/connect/token",
    clientId: "client-abc",
    encryptedClientSecret: encrypted,
    scopes: ["OR.Default"],
    encryptionKey: KEY,
    fetch: overrides.fetch,
    clock: overrides.clock?.now,
    refreshAtFraction: overrides.refresh ?? 0.8,
  });
}

describe("TokenManager", () => {
  it("fetches and caches a token, returning it on subsequent calls", async () => {
    const log = { calls: 0 };
    const clock = makeClock();
    const fetch = fakeFetch(
      () =>
        new Response(JSON.stringify({ access_token: "tok-1", expires_in: 3600 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      log,
    );
    const manager = makeManager({ fetch, clock });
    expect(await manager.getAccessToken()).toBe("tok-1");
    expect(await manager.getAccessToken()).toBe("tok-1");
    expect(log.calls).toBe(1);
  });

  it("refreshes the token after the configured fraction of expires_in", async () => {
    const log = { calls: 0 };
    const clock = makeClock();
    let counter = 0;
    const fetch = fakeFetch(() => {
      counter += 1;
      return new Response(JSON.stringify({ access_token: `tok-${counter}`, expires_in: 1000 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }, log);
    const manager = makeManager({ fetch, clock, refresh: 0.8 });
    expect(await manager.getAccessToken()).toBe("tok-1");
    clock.advance(799_000);
    expect(await manager.getAccessToken()).toBe("tok-1");
    clock.advance(2_000);
    expect(await manager.getAccessToken()).toBe("tok-2");
    expect(log.calls).toBe(2);
  });

  it("decrypts the client_secret and sends it in the form body", async () => {
    const log = { calls: 0 };
    let receivedBody = "";
    const fetch = fakeFetch((_url, init) => {
      const body = init.body;
      receivedBody =
        body instanceof URLSearchParams ? body.toString() : typeof body === "string" ? body : "";
      return new Response(JSON.stringify({ access_token: "tok", expires_in: 60 }), {
        status: 200,
      });
    }, log);
    const manager = makeManager({ fetch });
    await manager.getAccessToken();
    expect(receivedBody).toContain("grant_type=client_credentials");
    expect(receivedBody).toContain("client_id=client-abc");
    expect(receivedBody).toContain("client_secret=the-secret");
    expect(receivedBody).toContain("scope=OR.Default");
  });

  it("maps 401 to OrchestratorAuthError", async () => {
    const log = { calls: 0 };
    const fetch = fakeFetch(() => new Response("invalid_client", { status: 401 }), log);
    const manager = makeManager({ fetch });
    await expect(manager.getAccessToken()).rejects.toBeInstanceOf(OrchestratorAuthError);
  });

  it("maps 5xx to OrchestratorTransportError", async () => {
    const log = { calls: 0 };
    const fetch = fakeFetch(() => new Response("oops", { status: 503 }), log);
    const manager = makeManager({ fetch });
    await expect(manager.getAccessToken()).rejects.toBeInstanceOf(OrchestratorTransportError);
  });

  it("maps fetch rejections to OrchestratorTransportError", async () => {
    const fetch = (() => Promise.reject(new Error("ECONNRESET"))) as unknown as FetchFn;
    const manager = makeManager({ fetch });
    await expect(manager.getAccessToken()).rejects.toBeInstanceOf(OrchestratorTransportError);
  });

  it("rejects token responses missing access_token", async () => {
    const log = { calls: 0 };
    const fetch = fakeFetch(
      () => new Response(JSON.stringify({ expires_in: 60 }), { status: 200 }),
      log,
    );
    const manager = makeManager({ fetch });
    await expect(manager.getAccessToken()).rejects.toBeInstanceOf(OrchestratorAuthError);
  });

  it("invalidate() forces a re-fetch on next call", async () => {
    const log = { calls: 0 };
    const fetch = fakeFetch(
      () =>
        new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), {
          status: 200,
        }),
      log,
    );
    const manager = makeManager({ fetch });
    await manager.getAccessToken();
    manager.invalidate();
    await manager.getAccessToken();
    expect(log.calls).toBe(2);
  });

  it("dedupes concurrent in-flight requests", async () => {
    const log = { calls: 0 };
    let resolveResponse: (() => void) | undefined;
    const fetch = ((_url: string) =>
      new Promise<Response>((resolve) => {
        log.calls += 1;
        resolveResponse = () =>
          resolve(
            new Response(JSON.stringify({ access_token: "tok-shared", expires_in: 3600 }), {
              status: 200,
            }),
          );
      })) as unknown as FetchFn;
    const manager = makeManager({ fetch });
    const a = manager.getAccessToken();
    const b = manager.getAccessToken();
    if (resolveResponse === undefined) throw new Error("expected fetch to be called");
    resolveResponse();
    expect(await a).toBe("tok-shared");
    expect(await b).toBe("tok-shared");
    expect(log.calls).toBe(1);
  });
});
