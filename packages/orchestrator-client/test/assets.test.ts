import { beforeEach, describe, expect, it, vi } from "vitest";
import { AssetsClient } from "../src/assets.js";
import { RestClient } from "../src/rest-client.js";
import { emptyResponse, jsonResponse, stubTokenSource } from "./test-helpers.js";

const BASE = "https://cloud.uipath.com/o/t/orchestrator_";

const SAMPLE_ASSET = {
  Id: 7,
  Name: "MyAsset",
  ValueType: "Text",
  StringValue: "hello",
  Description: null,
  BoolValue: null,
  IntValue: null,
  CredentialUsername: null,
};

function makeClient(fetchMock: ReturnType<typeof vi.fn>): { client: AssetsClient; rest: RestClient } {
  const rest = new RestClient({
    baseUrl: BASE,
    tokenSource: stubTokenSource(),
    fetch: fetchMock as unknown as typeof fetch,
  });
  return { client: new AssetsClient(rest), rest };
}

describe("AssetsClient", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
  });

  it("list hits /odata/Assets and unwraps OData value", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ value: [SAMPLE_ASSET] }));
    const { client } = makeClient(fetchMock);
    const result = await client.list({ folder: { folderId: 1 } });
    expect(result).toHaveLength(1);
    expect(result[0]?.Name).toBe("MyAsset");
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe(`${BASE}/odata/Assets`);
  });

  it("getByName builds an $filter and $top=1 query", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ value: [SAMPLE_ASSET] }));
    const { client } = makeClient(fetchMock);
    const found = await client.getByName("MyAsset");
    expect(found?.Id).toBe(7);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("%24filter=Name+eq+%27MyAsset%27");
    expect(url).toContain("%24top=1");
  });

  it("getByName returns undefined when no match", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ value: [] }));
    const { client } = makeClient(fetchMock);
    const found = await client.getByName("Missing");
    expect(found).toBeUndefined();
  });

  it("create POSTs the body and returns the parsed entity", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(SAMPLE_ASSET));
    const { client } = makeClient(fetchMock);
    const created = await client.create({ Name: "MyAsset", ValueType: "Text", StringValue: "hello" });
    expect(created.Id).toBe(7);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toMatchObject({ Name: "MyAsset", ValueType: "Text" });
  });

  it("update PATCHes /odata/Assets({id}) with the partial input", async () => {
    fetchMock.mockResolvedValueOnce(emptyResponse(204));
    const { client } = makeClient(fetchMock);
    await client.update(7, { Description: "updated" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/odata/Assets(7)`);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ Description: "updated" });
  });

  it("delete DELETEs /odata/Assets({id})", async () => {
    fetchMock.mockResolvedValueOnce(emptyResponse(204));
    const { client } = makeClient(fetchMock);
    await client.delete(7);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/odata/Assets(7)`);
    expect(init.method).toBe("DELETE");
  });
});
