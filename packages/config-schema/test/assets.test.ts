import { describe, expect, it } from "vitest";
import { AssetsFile, ASSET_VALUE_TYPES } from "../src/assets.js";

describe("AssetsFile", () => {
  it("accepts each supported asset type", () => {
    const result = AssetsFile.safeParse({
      schemaVersion: 1,
      assets: [
        { name: "TextAsset", type: "text", value: "hello" },
        { name: "IntAsset", type: "integer", value: 42 },
        { name: "BoolAsset", type: "bool", value: true },
        {
          name: "KvAsset",
          type: "keyValueList",
          value: [
            { key: "k1", value: "v1" },
            { key: "k2", value: "v2" },
          ],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("does not accept credential as an asset type (it has its own file)", () => {
    expect(ASSET_VALUE_TYPES).not.toContain("credential");
    const result = AssetsFile.safeParse({
      schemaVersion: 1,
      assets: [{ name: "BadCredential", type: "credential", value: "x" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an integer asset whose value is a string", () => {
    const result = AssetsFile.safeParse({
      schemaVersion: 1,
      assets: [{ name: "BadInt", type: "integer", value: "42" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects names with spaces", () => {
    const result = AssetsFile.safeParse({
      schemaVersion: 1,
      assets: [{ name: "Bad Name", type: "text", value: "x" }],
    });
    expect(result.success).toBe(false);
  });

  it("flags duplicate asset names with a custom issue", () => {
    const result = AssetsFile.safeParse({
      schemaVersion: 1,
      assets: [
        { name: "Same", type: "text", value: "a" },
        { name: "Same", type: "text", value: "b" },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("duplicate asset name"))).toBe(true);
    }
  });

  it("accepts an empty asset list", () => {
    const result = AssetsFile.safeParse({ schemaVersion: 1, assets: [] });
    expect(result.success).toBe(true);
  });
});
