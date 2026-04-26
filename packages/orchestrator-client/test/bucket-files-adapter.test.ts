import { describe, expect, it } from "vitest";
import { jsonResponse, makeTokenManager, mockOrchestrator, tokenResponse } from "./test-helpers.js";
import { OrchestratorApiError, OrchestratorClient } from "../src/index.js";

const baseUrl = "https://orch.example/orchestrator_";

describe("BucketFilesAdapter — two-step upload", () => {
  it("calls GetWriteUri then PUTs the body to the returned URI WITHOUT the bearer token", async () => {
    const { fetch, recorded } = mockOrchestrator((req) => {
      if (req.url.includes("/connect/token")) return tokenResponse();
      if (req.url.includes("GetWriteUri")) {
        return jsonResponse({
          Uri: "https://blob.example/upload?sig=abc",
          Verb: "PUT",
          Headers: { "x-ms-blob-type": "BlockBlob" },
        });
      }
      if (req.url.startsWith("https://blob.example/")) {
        return new Response(null, { status: 201 });
      }
      throw new Error(`unexpected request: ${req.url}`);
    });
    const client = new OrchestratorClient({
      orchestratorUrl: baseUrl,
      tokenManager: makeTokenManager(fetch),
      fetch,
    });
    const body = new TextEncoder().encode("hello");
    const result = await client.bucketFiles.upload({
      bucketId: 7,
      path: "Config.json",
      contentType: "application/json",
      body,
    });
    expect(result.transport).toBe("rest_fallback");

    const writeUriCall = recorded.find((r) => r.url.includes("GetWriteUri"));
    expect(writeUriCall?.url).toContain("path=Config.json");
    expect(writeUriCall?.url).toContain("contentType=application");
    expect(writeUriCall?.headers["Authorization"]).toBe("Bearer tok");

    const uploadCall = recorded.find((r) => r.url.startsWith("https://blob.example/"));
    expect(uploadCall?.method).toBe("PUT");
    expect(uploadCall?.headers["Authorization"]).toBeUndefined();
    expect(uploadCall?.headers["x-ms-blob-type"]).toBe("BlockBlob");
    expect(uploadCall?.headers["Content-Type"]).toBe("application/json");
  });

  it("propagates upload PUT failures as OrchestratorApiError", async () => {
    const { fetch } = mockOrchestrator((req) => {
      if (req.url.includes("/connect/token")) return tokenResponse();
      if (req.url.includes("GetWriteUri")) {
        return jsonResponse({ Uri: "https://blob.example/upload", Verb: "PUT" });
      }
      return new Response("forbidden", { status: 403 });
    });
    const client = new OrchestratorClient({
      orchestratorUrl: baseUrl,
      tokenManager: makeTokenManager(fetch),
      fetch,
    });
    await expect(
      client.bucketFiles.upload({
        bucketId: 1,
        path: "x",
        contentType: "text/plain",
        body: new Uint8Array([1, 2]),
      }),
    ).rejects.toBeInstanceOf(OrchestratorApiError);
  });

  it("downloads via GetReadUri and returns Uint8Array", async () => {
    const payload = new TextEncoder().encode("abc");
    const { fetch } = mockOrchestrator((req) => {
      if (req.url.includes("/connect/token")) return tokenResponse();
      if (req.url.includes("GetReadUri")) {
        return jsonResponse({ Uri: "https://blob.example/read", Verb: "GET" });
      }
      if (req.url.startsWith("https://blob.example/read")) {
        return new Response(payload, { status: 200 });
      }
      throw new Error(`unexpected: ${req.url}`);
    });
    const client = new OrchestratorClient({
      orchestratorUrl: baseUrl,
      tokenManager: makeTokenManager(fetch),
      fetch,
    });
    const result = await client.bucketFiles.download(1, "Config.json");
    expect(new TextDecoder().decode(result.data)).toBe("abc");
  });

  it("lists files in a bucket via GetFiles", async () => {
    const { fetch, recorded } = mockOrchestrator((req) => {
      if (req.url.includes("/connect/token")) return tokenResponse();
      return jsonResponse({
        value: [
          { FullPath: "Config.json", Size: 12, ContentType: "application/json" },
          { FullPath: "Config.xlsx", Size: 1024 },
        ],
      });
    });
    const client = new OrchestratorClient({
      orchestratorUrl: baseUrl,
      tokenManager: makeTokenManager(fetch),
      fetch,
    });
    const result = await client.bucketFiles.list(7, { recursive: true });
    expect(result.data).toHaveLength(2);
    const apiCall = recorded.find((r) => r.url.includes("GetFiles"));
    expect(apiCall?.url).toContain("recursive=true");
  });

  it("deletes files via DeleteFile action", async () => {
    const { fetch, recorded } = mockOrchestrator((req) => {
      if (req.url.includes("/connect/token")) return tokenResponse();
      return new Response(null, { status: 204 });
    });
    const client = new OrchestratorClient({
      orchestratorUrl: baseUrl,
      tokenManager: makeTokenManager(fetch),
      fetch,
    });
    const result = await client.bucketFiles.delete(3, "old.json");
    expect(result.transport).toBe("rest_fallback");
    const apiCall = recorded.find((r) => r.url.includes("DeleteFile"));
    expect(apiCall?.method).toBe("DELETE");
    expect(apiCall?.url).toContain("path=old.json");
  });
});
