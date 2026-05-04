import { beforeEach, describe, expect, it, vi } from "vitest";
import { BucketFilesClient } from "../src/bucket-files.js";
import { RestClient } from "../src/rest-client.js";
import { emptyResponse, jsonResponse, stubTokenSource } from "./test-helpers.js";

const BASE = "https://cloud.uipath.com/o/t/orchestrator_";

function makeClient(fetchMock: ReturnType<typeof vi.fn>): BucketFilesClient {
  return new BucketFilesClient(
    new RestClient({
      baseUrl: BASE,
      tokenSource: stubTokenSource(),
      fetch: fetchMock as unknown as typeof fetch,
    }),
  );
}

describe("BucketFilesClient.upload", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
  });

  it("first GETs the signed write URI then PUTs the content to it", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          Uri: "https://signed.example.com/bucket/Config.json?sig=abc",
          Headers: { "x-ms-blob-type": "BlockBlob" },
        }),
      )
      .mockResolvedValueOnce(emptyResponse(201));

    await makeClient(fetchMock).upload(42, "Config.json", "{\"a\":1}", { contentType: "application/json" });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [getUrl, getInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(getUrl).toContain(
      `${BASE}/odata/Buckets(42)/UiPath.Server.Configuration.OData.GetWriteUri`,
    );
    expect(getUrl).toContain("path=Config.json");
    expect(getUrl).toContain("contentType=application%2Fjson");
    expect((getInit.headers as Record<string, string>).Authorization).toBe("Bearer stub-token");

    const [putUrl, putInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(putUrl).toBe("https://signed.example.com/bucket/Config.json?sig=abc");
    expect(putInit.method).toBe("PUT");
    expect((putInit.headers as Record<string, string>)["x-ms-blob-type"]).toBe("BlockBlob");
    // The signed URL embeds its own auth — our Bearer must NOT leak.
    expect((putInit.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(putInit.body).toBe("{\"a\":1}");
  });

  it("normalises Headers when returned in the {Keys[],Values[]} shape", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          Uri: "https://signed.example.com/blob",
          Headers: { Keys: ["x-ms-blob-type", "x-ms-version"], Values: ["BlockBlob", "2020-04-08"] },
        }),
      )
      .mockResolvedValueOnce(emptyResponse(201));
    await makeClient(fetchMock).upload(42, "x.txt", "hello", { contentType: "text/plain" });
    const [, putInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    const headers = putInit.headers as Record<string, string>;
    expect(headers["x-ms-blob-type"]).toBe("BlockBlob");
    expect(headers["x-ms-version"]).toBe("2020-04-08");
  });
});

describe("BucketFilesClient.download", () => {
  it("GETs the signed read URI and returns bytes", async () => {
    const fetchMock = vi.fn();
    const bytes = new Uint8Array([10, 20, 30]);
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ Uri: "https://signed.example.com/blob" }))
      .mockResolvedValueOnce(new Response(bytes, { status: 200 }));
    const result = await makeClient(fetchMock).download(42, "x.bin");
    expect(Array.from(result)).toEqual([10, 20, 30]);
    expect((fetchMock.mock.calls[0]?.[0] as string)).toContain("GetReadUri");
    expect((fetchMock.mock.calls[0]?.[0] as string)).toContain("path=x.bin");
  });
});

describe("BucketFilesClient.list / delete", () => {
  it("list calls GetFiles and unwraps OData value", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        value: [
          { FullPath: "Config.json", Size: 32, ContentType: "application/json" },
        ],
      }),
    );
    const result = await makeClient(fetchMock).list(42);
    expect(result).toHaveLength(1);
    expect(result[0]?.FullPath).toBe("Config.json");
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain(`${BASE}/odata/Buckets(42)/UiPath.Server.Configuration.OData.GetFiles`);
  });

  it("delete calls DeleteFile with the path query param", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(emptyResponse(204));
    await makeClient(fetchMock).delete(42, "Config.json");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("DeleteFile");
    expect(url).toContain("path=Config.json");
    expect(init.method).toBe("DELETE");
  });
});
