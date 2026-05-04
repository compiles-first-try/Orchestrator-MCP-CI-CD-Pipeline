import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  OrchestratorAuthError,
  OrchestratorRequestError,
  OrchestratorTransportError,
} from "../src/errors.js";
import { RestClient } from "../src/rest-client.js";
import { emptyResponse, jsonResponse, stubTokenSource, textResponse } from "./test-helpers.js";

const BASE = "https://cloud.uipath.com/test-org/test-tenant/orchestrator_";

const SimpleSchema = z.object({ ok: z.boolean() });

describe("RestClient.get", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
  });

  it("attaches Bearer auth and parses the JSON body", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    const client = new RestClient({
      baseUrl: BASE,
      tokenSource: stubTokenSource("tok-123"),
      fetch: fetchMock as unknown as typeof fetch,
    });
    const result = await client.get("/odata/Whatever", SimpleSchema);
    expect(result).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/odata/Whatever`);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok-123");
    expect((init.headers as Record<string, string>).Accept).toBe("application/json");
    expect(init.method).toBe("GET");
  });

  it("appends query params via URLSearchParams", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    const client = new RestClient({
      baseUrl: BASE,
      tokenSource: stubTokenSource(),
      fetch: fetchMock as unknown as typeof fetch,
    });
    await client.get("/odata/Assets", SimpleSchema, {
      query: { $filter: "Name eq 'foo'", $top: 1 },
    });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("%24filter=Name+eq+%27foo%27");
    expect(url).toContain("%24top=1");
  });

  it("attaches the folder header from folderId", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    const client = new RestClient({
      baseUrl: BASE,
      tokenSource: stubTokenSource(),
      fetch: fetchMock as unknown as typeof fetch,
    });
    await client.get("/odata/Assets", SimpleSchema, { folder: { folderId: 99 } });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["X-UIPATH-OrganizationUnitId"]).toBe("99");
  });

  it("retries once on 401 and succeeds the second time", async () => {
    fetchMock
      .mockResolvedValueOnce(textResponse("token expired", 401))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    const client = new RestClient({
      baseUrl: BASE,
      tokenSource: stubTokenSource(),
      fetch: fetchMock as unknown as typeof fetch,
    });
    const result = await client.get("/x", SimpleSchema);
    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws OrchestratorAuthError when 401 persists after retry", async () => {
    fetchMock.mockResolvedValue(textResponse("invalid_token", 401));
    const client = new RestClient({
      baseUrl: BASE,
      tokenSource: stubTokenSource(),
      fetch: fetchMock as unknown as typeof fetch,
    });
    await expect(client.get("/x", SimpleSchema)).rejects.toBeInstanceOf(OrchestratorAuthError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws OrchestratorRequestError for 4xx other than 401", async () => {
    fetchMock.mockResolvedValueOnce(textResponse("Forbidden", 403));
    const client = new RestClient({
      baseUrl: BASE,
      tokenSource: stubTokenSource(),
      fetch: fetchMock as unknown as typeof fetch,
    });
    let caught: unknown;
    try {
      await client.get("/x", SimpleSchema);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(OrchestratorRequestError);
    if (caught instanceof OrchestratorRequestError) {
      expect(caught.status).toBe(403);
      expect(caught.code).toBe("orchestrator.request_failed.403");
    }
  });

  it("throws OrchestratorRequestError for 5xx", async () => {
    fetchMock.mockResolvedValueOnce(textResponse("boom", 500));
    const client = new RestClient({
      baseUrl: BASE,
      tokenSource: stubTokenSource(),
      fetch: fetchMock as unknown as typeof fetch,
    });
    await expect(client.get("/x", SimpleSchema)).rejects.toBeInstanceOf(OrchestratorRequestError);
  });

  it("throws OrchestratorTransportError on a network failure", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNRESET"));
    const client = new RestClient({
      baseUrl: BASE,
      tokenSource: stubTokenSource(),
      fetch: fetchMock as unknown as typeof fetch,
    });
    await expect(client.get("/x", SimpleSchema)).rejects.toBeInstanceOf(OrchestratorTransportError);
  });

  it("throws OrchestratorRequestError on a schema mismatch", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: "not-a-bool" }));
    const client = new RestClient({
      baseUrl: BASE,
      tokenSource: stubTokenSource(),
      fetch: fetchMock as unknown as typeof fetch,
    });
    await expect(client.get("/x", SimpleSchema)).rejects.toBeInstanceOf(OrchestratorRequestError);
  });
});

describe("RestClient body methods", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
  });

  it("post serialises the body as JSON and sets Content-Type", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    const client = new RestClient({
      baseUrl: BASE,
      tokenSource: stubTokenSource(),
      fetch: fetchMock as unknown as typeof fetch,
    });
    await client.post("/odata/Assets", { Name: "X" }, SimpleSchema);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(init.body).toBe(JSON.stringify({ Name: "X" }));
  });

  it("patch uses PATCH method", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    const client = new RestClient({
      baseUrl: BASE,
      tokenSource: stubTokenSource(),
      fetch: fetchMock as unknown as typeof fetch,
    });
    await client.patch("/odata/Assets(1)", { Description: "x" }, SimpleSchema);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("PATCH");
  });

  it("delete returns void and uses DELETE method", async () => {
    fetchMock.mockResolvedValue(emptyResponse(204));
    const client = new RestClient({
      baseUrl: BASE,
      tokenSource: stubTokenSource(),
      fetch: fetchMock as unknown as typeof fetch,
    });
    await client.delete("/odata/Assets(1)");
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("DELETE");
  });
});

describe("RestClient.putRaw / getRaw", () => {
  it("putRaw goes to the absolute URL with no Authorization header attached", async () => {
    const fetchMock = vi.fn().mockResolvedValue(emptyResponse(201));
    const client = new RestClient({
      baseUrl: BASE,
      tokenSource: stubTokenSource(),
      fetch: fetchMock as unknown as typeof fetch,
    });
    await client.putRaw("https://signed-url.example.com/foo", "payload", { "x-ms-blob-type": "BlockBlob" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://signed-url.example.com/foo");
    expect(init.method).toBe("PUT");
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    expect((init.headers as Record<string, string>)["x-ms-blob-type"]).toBe("BlockBlob");
  });

  it("getRaw returns the response bytes as Uint8Array", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const response = new Response(bytes, { status: 200 });
    const fetchMock = vi.fn().mockResolvedValue(response);
    const client = new RestClient({
      baseUrl: BASE,
      tokenSource: stubTokenSource(),
      fetch: fetchMock as unknown as typeof fetch,
    });
    const result = await client.getRaw("https://signed-url.example.com/file");
    expect(Array.from(result)).toEqual([1, 2, 3, 4]);
  });

  it("putRaw throws OrchestratorRequestError on a non-2xx", async () => {
    const fetchMock = vi.fn().mockResolvedValue(textResponse("denied", 403));
    const client = new RestClient({
      baseUrl: BASE,
      tokenSource: stubTokenSource(),
      fetch: fetchMock as unknown as typeof fetch,
    });
    await expect(client.putRaw("https://x.example.com/y", "p")).rejects.toBeInstanceOf(
      OrchestratorRequestError,
    );
  });
});
