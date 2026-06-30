import { describe, it, expect, vi } from "vitest";
import { FoldersClient } from "../src/folders.js";
import type { RestClient } from "../src/rest-client.js";

function mockRest(): RestClient {
  return {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  } as unknown as RestClient;
}

describe("FoldersClient", () => {
  it("lists folders via GET /odata/Folders", async () => {
    const rest = mockRest();
    const folders = [
      { Id: 1, DisplayName: "Finance", FullyQualifiedName: "Finance" },
    ];
    vi.mocked(rest.get).mockResolvedValueOnce({ value: folders });

    const client = new FoldersClient(rest);
    const result = await client.list();

    expect(result).toEqual(folders);
    expect(rest.get).toHaveBeenCalledWith(
      "/odata/Folders",
      expect.anything(),
      {},
    );
  });

  it("creates a folder via POST", async () => {
    const rest = mockRest();
    const created = { Id: 5, DisplayName: "Invoicing" };
    vi.mocked(rest.post).mockResolvedValueOnce(created);

    const client = new FoldersClient(rest);
    const result = await client.create({ DisplayName: "Invoicing" });

    expect(result).toEqual(created);
    expect(rest.post).toHaveBeenCalledWith(
      "/odata/Folders",
      { DisplayName: "Invoicing" },
      expect.anything(),
      {},
    );
  });

  it("getByDisplayName filters with OData $filter", async () => {
    const rest = mockRest();
    const folder = { Id: 2, DisplayName: "HR" };
    vi.mocked(rest.get).mockResolvedValueOnce({ value: [folder] });

    const client = new FoldersClient(rest);
    const result = await client.getByDisplayName("HR");

    expect(result).toEqual(folder);
    expect(rest.get).toHaveBeenCalledWith(
      "/odata/Folders",
      expect.anything(),
      expect.objectContaining({
        query: expect.objectContaining({
          $filter: "DisplayName eq 'HR'",
          $top: 1,
        }),
      }),
    );
  });

  it("ensurePath creates nested folders that don't exist", async () => {
    const rest = mockRest();
    // getByFullyQualifiedName for "Finance" — exists
    vi.mocked(rest.get)
      .mockResolvedValueOnce({ value: [{ Id: 1, DisplayName: "Finance", FullyQualifiedName: "Finance" }] })
      // getByFullyQualifiedName for "Finance/Invoicing" — doesn't exist
      .mockResolvedValueOnce({ value: [] });
    // create "Invoicing" under parent 1
    vi.mocked(rest.post).mockResolvedValueOnce({
      Id: 10,
      DisplayName: "Invoicing",
      FullyQualifiedName: "Finance/Invoicing",
    });

    const client = new FoldersClient(rest);
    const result = await client.ensurePath("Finance/Invoicing");

    expect(result.Id).toBe(10);
    expect(rest.post).toHaveBeenCalledTimes(1);
    expect(rest.post).toHaveBeenCalledWith(
      "/odata/Folders",
      expect.objectContaining({
        DisplayName: "Invoicing",
        ParentId: 1,
        ProvisionType: "Manual",
      }),
      expect.anything(),
      {},
    );
  });
});
