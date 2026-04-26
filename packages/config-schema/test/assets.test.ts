import { describe, expect, it } from "vitest";
import { ConfigSchemaError, parseAssets } from "../src/index.js";

describe("parseAssets", () => {
  it("accepts a text asset and applies the default scope", () => {
    const result = parseAssets([{ name: "OrchestratorUrl", type: "text", value: "https://x" }]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: "OrchestratorUrl",
      type: "text",
      value: "https://x",
      scope: "global",
    });
  });

  it("accepts integer, boolean, and credential assets", () => {
    const result = parseAssets([
      { name: "MaxRows", type: "integer", value: 1000 },
      { name: "FeatureFlag", type: "boolean", value: false },
      { name: "ApiCreds", type: "credential", value: "ServiceAccount" },
    ]);
    expect(result).toHaveLength(3);
  });

  it("rejects non-integer values for integer type", () => {
    expect(() => parseAssets([{ name: "X", type: "integer", value: 1.5 }])).toThrow(
      ConfigSchemaError,
    );
  });

  it("rejects mismatched value type per discriminator", () => {
    expect(() => parseAssets([{ name: "X", type: "boolean", value: "yes" }])).toThrow(
      ConfigSchemaError,
    );
  });

  it("rejects credential value that does not look like a name", () => {
    expect(() => parseAssets([{ name: "X", type: "credential", value: "has space" }])).toThrow(
      ConfigSchemaError,
    );
  });

  it("rejects unknown type discriminator", () => {
    expect(() => parseAssets([{ name: "X", type: "decimal", value: 1 }])).toThrow(
      ConfigSchemaError,
    );
  });

  it("rejects unknown scope value", () => {
    expect(() =>
      parseAssets([{ name: "X", type: "text", value: "y", scope: "per-tenant" }]),
    ).toThrow(ConfigSchemaError);
  });

  it("rejects duplicate names", () => {
    expect(() =>
      parseAssets([
        { name: "Same", type: "text", value: "a" },
        { name: "Same", type: "text", value: "b" },
      ]),
    ).toThrow(ConfigSchemaError);
  });

  it("rejects names that violate the name pattern", () => {
    expect(() => parseAssets([{ name: "1bad", type: "text", value: "x" }])).toThrow(
      ConfigSchemaError,
    );
  });
});
