import { beforeEach, describe, expect, it, vi } from "vitest";
import { OrchestratorAuthError, OrchestratorTransportError } from "../src/errors.js";
import { TokenManager } from "../src/token-manager.js";
import type { TenantConnectionConfig } from "../src/types.js";

const CONFIG: TenantConnectionConfig = {
  identityTokenUrl: "https://cloud.uipath.com/test-org/identity_/connect/token",
  clientId: "test-client",
  clientSecret: "test-secret",
  scopes: ["OR.Assets", "OR.Queues"],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function textResponse(body: string, status: number): Response {
  return new Response(body, { status, headers: { "Content-Type": "text/plain" } });
}

function makeClock(start: Date): { now: () => Date; advance: (ms: number) => void } {
  let current = start.getTime();
  return {
    now: () => new Date(current),
    advance: (ms: number) => {
      current += ms;
    },
  };
}

describe("TokenManager.getToken", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
  });

  it("fetches a token on first call and returns its parsed shape", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        access_token: "abc123",
        token_type: "Bearer",
        expires_in: 3600,
        scope: "OR.Assets OR.Queues",
      }),
    );
    const clock = makeClock(new Date("2026-05-02T12:00:00Z"));
    const manager = new TokenManager(CONFIG, { fetch: fetchMock as unknown as typeof fetch, clock: clock.now });

    const token = await manager.getToken();

    expect(token.token).toBe("abc123");
    expect(token.tokenType).toBe("Bearer");
    expect(token.scopesGranted).toEqual(["OR.Assets", "OR.Queues"]);
    expect(token.obtainedAt.toISOString()).toBe("2026-05-02T12:00:00.000Z");
    expect(token.expiresAt.toISOString()).toBe("2026-05-02T13:00:00.000Z");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends the OAuth2 client_credentials body and the form-urlencoded header", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ access_token: "x", token_type: "Bearer", expires_in: 3600 }),
    );
    const manager = new TokenManager(CONFIG, { fetch: fetchMock as unknown as typeof fetch });
    await manager.getToken();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(CONFIG.identityTokenUrl);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/x-www-form-urlencoded");
    const body = new URLSearchParams(init.body as string);
    expect(body.get("grant_type")).toBe("client_credentials");
    expect(body.get("client_id")).toBe("test-client");
    expect(body.get("client_secret")).toBe("test-secret");
    expect(body.get("scope")).toBe("OR.Assets OR.Queues");
  });

  it("returns the cached token without re-fetching while within lifetime", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ access_token: "abc", token_type: "Bearer", expires_in: 3600 }),
    );
    const clock = makeClock(new Date("2026-05-02T12:00:00Z"));
    const manager = new TokenManager(CONFIG, { fetch: fetchMock as unknown as typeof fetch, clock: clock.now });

    await manager.getToken();
    clock.advance(60_000); // 1 minute later — well below 80% threshold
    await manager.getToken();
    await manager.getToken();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(manager.isCacheValid()).toBe(true);
  });

  it("refreshes once the 80% lifetime threshold has elapsed", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: "first", token_type: "Bearer", expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ access_token: "second", token_type: "Bearer", expires_in: 3600 }));
    const clock = makeClock(new Date("2026-05-02T12:00:00Z"));
    const manager = new TokenManager(CONFIG, { fetch: fetchMock as unknown as typeof fetch, clock: clock.now });

    const t1 = await manager.getToken();
    expect(t1.token).toBe("first");

    clock.advance(2_879_999); // 47:59.999 — still below 80% (2880s = 48m)
    expect(manager.isCacheValid()).toBe(true);
    expect((await manager.getToken()).token).toBe("first");

    clock.advance(2); // crosses the 80% boundary
    expect(manager.isCacheValid()).toBe(false);
    const t2 = await manager.getToken();
    expect(t2.token).toBe("second");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("collapses concurrent calls into a single in-flight refresh (single-flight)", async () => {
    let resolveResponse: (value: Response) => void = () => undefined;
    const promise = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    fetchMock.mockReturnValueOnce(promise);
    const manager = new TokenManager(CONFIG, { fetch: fetchMock as unknown as typeof fetch });

    const calls = [manager.getToken(), manager.getToken(), manager.getToken()];
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveResponse(jsonResponse({ access_token: "single", token_type: "Bearer", expires_in: 3600 }));
    const tokens = await Promise.all(calls);
    expect(tokens.every((t) => t.token === "single")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("wraps network failures as OrchestratorTransportError", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNRESET"));
    const manager = new TokenManager(CONFIG, { fetch: fetchMock as unknown as typeof fetch });
    await expect(manager.getToken()).rejects.toBeInstanceOf(OrchestratorTransportError);
  });

  it("throws OrchestratorAuthError on a non-2xx response and includes the body", async () => {
    fetchMock.mockResolvedValueOnce(textResponse("invalid_client", 401));
    const manager = new TokenManager(CONFIG, { fetch: fetchMock as unknown as typeof fetch });
    let caught: unknown;
    try {
      await manager.getToken();
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(OrchestratorAuthError);
    if (caught instanceof OrchestratorAuthError) {
      expect(caught.code).toBe("orchestrator.auth_failed");
      expect(caught.message).toContain("401");
      expect(caught.message).toContain("invalid_client");
    }
  });

  it("throws OrchestratorAuthError on malformed JSON", async () => {
    fetchMock.mockResolvedValueOnce(new Response("not json", { status: 200 }));
    const manager = new TokenManager(CONFIG, { fetch: fetchMock as unknown as typeof fetch });
    await expect(manager.getToken()).rejects.toBeInstanceOf(OrchestratorAuthError);
  });

  it("throws OrchestratorAuthError when the response is missing required fields", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ access_token: "abc" })); // missing token_type and expires_in
    const manager = new TokenManager(CONFIG, { fetch: fetchMock as unknown as typeof fetch });
    await expect(manager.getToken()).rejects.toBeInstanceOf(OrchestratorAuthError);
  });

  it("re-fetches after a failed refresh attempt (single-flight is cleared on rejection)", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce(jsonResponse({ access_token: "after-retry", token_type: "Bearer", expires_in: 3600 }));
    const manager = new TokenManager(CONFIG, { fetch: fetchMock as unknown as typeof fetch });
    await expect(manager.getToken()).rejects.toBeInstanceOf(OrchestratorTransportError);
    const t = await manager.getToken();
    expect(t.token).toBe("after-retry");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("treats an empty scope field as an empty granted-scopes array", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ access_token: "x", token_type: "Bearer", expires_in: 3600, scope: "" }),
    );
    const manager = new TokenManager(CONFIG, { fetch: fetchMock as unknown as typeof fetch });
    const t = await manager.getToken();
    expect(t.scopesGranted).toEqual([]);
  });
});
