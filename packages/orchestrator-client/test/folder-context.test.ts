import { describe, expect, it } from "vitest";
import { folderHeaders, type FolderContext } from "../src/folder-context.js";

describe("folderHeaders", () => {
  it("returns an empty object when no folder is supplied", () => {
    expect(folderHeaders(undefined)).toEqual({});
  });

  it("emits OrganizationUnitId for folderId", () => {
    expect(folderHeaders({ folderId: 42 })).toEqual({ "X-UIPATH-OrganizationUnitId": "42" });
    expect(folderHeaders({ folderId: "abc" })).toEqual({ "X-UIPATH-OrganizationUnitId": "abc" });
  });

  it("emits FolderKey for folderKey", () => {
    expect(folderHeaders({ folderKey: "key-1" })).toEqual({ "X-UIPATH-FolderKey": "key-1" });
  });

  it("URL-encodes folderPath", () => {
    const ctx: FolderContext = { folderPath: "Shared/Project A" };
    expect(folderHeaders(ctx)).toEqual({
      "X-UIPATH-FolderPath-Encoded": "Shared%2FProject%20A",
    });
  });
});
