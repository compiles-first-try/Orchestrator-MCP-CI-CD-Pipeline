import { describe, expect, it } from "vitest";
import { ConfigSchemaError, parseOverrides } from "../src/index.js";

describe("parseOverrides", () => {
  it("accepts an empty object (no overrides)", () => {
    expect(parseOverrides({})).toEqual({});
  });

  it("accepts asset value overrides", () => {
    const result = parseOverrides({
      assets: {
        OrchestratorUrl: { value: "https://dev.example/" },
        MaxRows: { value: 5000 },
        FeatureFlag: { value: true },
      },
    });
    expect(result.assets?.OrchestratorUrl?.value).toBe("https://dev.example/");
  });

  it("rejects override keys that are not valid asset names", () => {
    expect(() => parseOverrides({ assets: { "bad name": { value: "x" } } })).toThrow(
      ConfigSchemaError,
    );
  });

  it("rejects non-scalar override values", () => {
    expect(() => parseOverrides({ assets: { Asset: { value: { nested: true } } } })).toThrow(
      ConfigSchemaError,
    );
  });
});
