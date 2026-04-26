import { describe, expect, it } from "vitest";
import {
  OrchestratorApiError,
  OrchestratorHttp,
  OrchestratorTransportError,
  TokenManager,
  type FetchFn,
} from "../src/index.js";
import { encryptSecret, parseEncryptionKey } from "../src/index.js";
import { randomBytes } from "node:crypto";

const KEY = parseEncryptionKey(randomBytes(32).toString("base64"));

interface RecordedRequest {
  url: string;
  method: string | undefined;
  headers: Record<string, string>;
  body: string | undefined;
}

function makeStubTokenManager(fetch: FetchFn) {
  return new TokenManager({
    tokenUrl: "https://example/identity_/connect/token",
    clientId: "client-abc",
    encryptedClientSecret: encryptSecret("the-secret", KEY),
    scopes: ["OR.Default"],
    encryptionKey: KEY,
    fetch,
  });
}

function recordingFetch(responder: (request: RecordedRequest) => Response | Promise<Response>): {
  fetch: FetchFn;
  recorded: RecordedRequest[];
} {
  const recorded: RecordedRequest[] = [];
  const fetch: FetchFn = async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    const headers: Record<string, string> = {};
    const rawHeaders = (init?.headers ?? {}) as Record<string, string>;
    for (const [key, value] of Object.entries(rawHeaders)) headers[key] = value;
    const request: RecordedRequest = {
      url,
      method: init?.method,
      headers,
      body: typeof init?.body === "string" ? init.body : undefined,
    };
    recorded.push(request);
    return responder(request);
  };
  return { fetch, recorded };
}

const tokenResponse = () =>
  new Response(JSON.stringify({ access_token: "tok-1", expires_in: 3600 }), { status: 200 });

describe("OrchestratorHttp", () => {
  it("attaches Authorization and the folder header on every request", async () => {
    const { fetch, recorded } = recordingFetch((req) => {
      if (req.url.includes("/connect/token")) return tokenResponse();
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    const tm = makeStubTokenManager(fetch);
    const http = new OrchestratorHttp({
      baseUrl: "https://orch.example/orchestrator_",
      tokenManager: tm,
      fetch,
      folderId: "folder-42",
    });
    const result = await http.get<{ ok: boolean }>("/odata/Assets");
    expect(result).toEqual({ ok: true });
    const apiCall = recorded.find((r) => r.url.includes("/odata/Assets"));
    expect(apiCall?.headers["Authorization"]).toBe("Bearer tok-1");
    expect(apiCall?.headers["X-UIPATH-OrganizationUnitId"]).toBe("folder-42");
  });

  it("appends query parameters", async () => {
    const { fetch, recorded } = recordingFetch((req) => {
      if (req.url.includes("/connect/token")) return tokenResponse();
      return new Response(JSON.stringify({ value: [] }), { status: 200 });
    });
    const tm = makeStubTokenManager(fetch);
    const http = new OrchestratorHttp({
      baseUrl: "https://orch.example/orchestrator_",
      tokenManager: tm,
      fetch,
    });
    await http.get("/odata/Assets", { query: { $top: 10, $filter: "Name eq 'X'" } });
    const apiCall = recorded.find((r) => r.url.includes("/odata/Assets"));
    expect(apiCall?.url).toContain("%24top=10");
    expect(apiCall?.url).toContain("%24filter=");
  });

  it("posts JSON bodies with Content-Type", async () => {
    const { fetch, recorded } = recordingFetch((req) => {
      if (req.url.includes("/connect/token")) return tokenResponse();
      return new Response(JSON.stringify({ Id: 1 }), { status: 201 });
    });
    const tm = makeStubTokenManager(fetch);
    const http = new OrchestratorHttp({
      baseUrl: "https://orch.example/orchestrator_",
      tokenManager: tm,
      fetch,
    });
    const created = await http.post<{ Id: number }>("/odata/Assets", { Name: "X" });
    expect(created.Id).toBe(1);
    const apiCall = recorded.find((r) => r.url.includes("/odata/Assets"));
    expect(apiCall?.method).toBe("POST");
    expect(apiCall?.headers["Content-Type"]).toBe("application/json");
    expect(apiCall?.body).toBe(JSON.stringify({ Name: "X" }));
  });

  it("returns undefined for 204 No Content", async () => {
    const { fetch } = recordingFetch((req) => {
      if (req.url.includes("/connect/token")) return tokenResponse();
      return new Response(null, { status: 204 });
    });
    const tm = makeStubTokenManager(fetch);
    const http = new OrchestratorHttp({
      baseUrl: "https://orch.example/orchestrator_",
      tokenManager: tm,
      fetch,
    });
    const result = await http.delete("/odata/Assets(1)");
    expect(result).toBeUndefined();
  });

  it("maps non-2xx responses to OrchestratorApiError with status", async () => {
    const { fetch } = recordingFetch((req) => {
      if (req.url.includes("/connect/token")) return tokenResponse();
      return new Response("not found", { status: 404 });
    });
    const tm = makeStubTokenManager(fetch);
    const http = new OrchestratorHttp({
      baseUrl: "https://orch.example/orchestrator_",
      tokenManager: tm,
      fetch,
    });
    try {
      await http.get("/odata/Assets(1)");
      expect.fail("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OrchestratorApiError);
      expect((err as OrchestratorApiError).status).toBe(404);
    }
  });

  it("invalidates the cached token on 401", async () => {
    let nthCall = 0;
    const { fetch } = recordingFetch((req) => {
      if (req.url.includes("/connect/token")) {
        nthCall += 1;
        return new Response(JSON.stringify({ access_token: `tok-${nthCall}`, expires_in: 3600 }), {
          status: 200,
        });
      }
      return new Response("denied", { status: 401 });
    });
    const tm = makeStubTokenManager(fetch);
    const http = new OrchestratorHttp({
      baseUrl: "https://orch.example/orchestrator_",
      tokenManager: tm,
      fetch,
    });
    await expect(http.get("/odata/Assets")).rejects.toBeInstanceOf(OrchestratorApiError);
    await expect(http.get("/odata/Assets")).rejects.toBeInstanceOf(OrchestratorApiError);
    expect(nthCall).toBe(2);
  });

  it("maps fetch rejections to OrchestratorTransportError", async () => {
    let firstCall = true;
    const fetch = ((url: string) => {
      if (firstCall && url.includes("/connect/token")) {
        firstCall = false;
        return Promise.resolve(tokenResponse());
      }
      return Promise.reject(new Error("ECONNRESET"));
    }) as unknown as FetchFn;
    const tm = makeStubTokenManager(fetch);
    const http = new OrchestratorHttp({
      baseUrl: "https://orch.example/orchestrator_",
      tokenManager: tm,
      fetch,
    });
    await expect(http.get("/odata/Assets")).rejects.toBeInstanceOf(OrchestratorTransportError);
  });

  it("strips trailing slashes from baseUrl", async () => {
    const { fetch, recorded } = recordingFetch((req) => {
      if (req.url.includes("/connect/token")) return tokenResponse();
      return new Response("{}", { status: 200 });
    });
    const tm = makeStubTokenManager(fetch);
    const http = new OrchestratorHttp({
      baseUrl: "https://orch.example/orchestrator_/",
      tokenManager: tm,
      fetch,
    });
    await http.get("/odata/Assets");
    const apiCall = recorded.find((r) => r.url.includes("/odata/Assets"));
    expect(apiCall?.url).toBe("https://orch.example/orchestrator_/odata/Assets");
  });

  it("merges per-call folderId override with the default", async () => {
    const { fetch, recorded } = recordingFetch((req) => {
      if (req.url.includes("/connect/token")) return tokenResponse();
      return new Response("{}", { status: 200 });
    });
    const tm = makeStubTokenManager(fetch);
    const http = new OrchestratorHttp({
      baseUrl: "https://orch.example/orchestrator_",
      tokenManager: tm,
      fetch,
      folderId: "default-folder",
    });
    await http.get("/odata/Assets", { folderId: "override-folder" });
    const apiCall = recorded.find((r) => r.url.includes("/odata/Assets"));
    expect(apiCall?.headers["X-UIPATH-OrganizationUnitId"]).toBe("override-folder");
  });
});
