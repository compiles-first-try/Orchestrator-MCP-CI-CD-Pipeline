import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueuesClient } from "../src/queues.js";
import { RestClient } from "../src/rest-client.js";
import { emptyResponse, jsonResponse, stubTokenSource } from "./test-helpers.js";

const BASE = "https://cloud.uipath.com/o/t/orchestrator_";

const SAMPLE_QUEUE = {
  Id: 11,
  Name: "OrdersQueue",
  Description: null,
  AcceptAutomaticallyRetry: true,
  MaxNumberOfRetries: 3,
  EnforceUniqueReference: false,
  Encrypted: false,
};

function makeClient(fetchMock: ReturnType<typeof vi.fn>): QueuesClient {
  return new QueuesClient(
    new RestClient({
      baseUrl: BASE,
      tokenSource: stubTokenSource(),
      fetch: fetchMock as unknown as typeof fetch,
    }),
  );
}

describe("QueuesClient", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
  });

  it("list hits /odata/QueueDefinitions", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ value: [SAMPLE_QUEUE] }));
    const result = await makeClient(fetchMock).list();
    expect(result).toHaveLength(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE}/odata/QueueDefinitions`);
  });

  it("getByName uses $filter and returns first match", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ value: [SAMPLE_QUEUE] }));
    const found = await makeClient(fetchMock).getByName("OrdersQueue");
    expect(found?.Id).toBe(11);
    expect((fetchMock.mock.calls[0]?.[0] as string)).toContain("%24filter=Name+eq+%27OrdersQueue%27");
  });

  it("create POSTs to /odata/QueueDefinitions", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(SAMPLE_QUEUE));
    await makeClient(fetchMock).create({ Name: "OrdersQueue", MaxNumberOfRetries: 3 });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/odata/QueueDefinitions`);
    expect(init.method).toBe("POST");
  });

  it("update PATCHes by id", async () => {
    fetchMock.mockResolvedValueOnce(emptyResponse(204));
    await makeClient(fetchMock).update(11, { MaxNumberOfRetries: 5 });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/odata/QueueDefinitions(11)`);
    expect(init.method).toBe("PATCH");
  });

  it("delete DELETEs by id", async () => {
    fetchMock.mockResolvedValueOnce(emptyResponse(204));
    await makeClient(fetchMock).delete(11);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/odata/QueueDefinitions(11)`);
    expect(init.method).toBe("DELETE");
  });
});
