import { beforeEach, describe, expect, it, vi } from "vitest";
import { BucketsClient } from "../src/buckets.js";
import { RestClient } from "../src/rest-client.js";
import { emptyResponse, jsonResponse, stubTokenSource } from "./test-helpers.js";

const BASE = "https://cloud.uipath.com/o/t/orchestrator_";

const SAMPLE_BUCKET = {
  Id: 21,
  Name: "config",
  StorageProvider: "Orchestrator",
};

function makeClient(fetchMock: ReturnType<typeof vi.fn>): BucketsClient {
  return new BucketsClient(
    new RestClient({
      baseUrl: BASE,
      tokenSource: stubTokenSource(),
      fetch: fetchMock as unknown as typeof fetch,
    }),
  );
}

describe("BucketsClient", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
  });

  it("list hits /odata/Buckets", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ value: [SAMPLE_BUCKET] }));
    const result = await makeClient(fetchMock).list();
    expect(result).toHaveLength(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE}/odata/Buckets`);
  });

  it("getByName uses $filter", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ value: [SAMPLE_BUCKET] }));
    const found = await makeClient(fetchMock).getByName("config");
    expect(found?.Id).toBe(21);
  });

  it("create POSTs to /odata/Buckets", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(SAMPLE_BUCKET));
    await makeClient(fetchMock).create({ Name: "config", StorageProvider: "Orchestrator" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/odata/Buckets`);
    expect(init.method).toBe("POST");
  });

  it("update PATCHes by id", async () => {
    fetchMock.mockResolvedValueOnce(emptyResponse(204));
    await makeClient(fetchMock).update(21, { Description: "the project bucket" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/odata/Buckets(21)`);
    expect(init.method).toBe("PATCH");
  });

  it("delete DELETEs by id", async () => {
    fetchMock.mockResolvedValueOnce(emptyResponse(204));
    await makeClient(fetchMock).delete(21);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/odata/Buckets(21)`);
    expect(init.method).toBe("DELETE");
  });
});
