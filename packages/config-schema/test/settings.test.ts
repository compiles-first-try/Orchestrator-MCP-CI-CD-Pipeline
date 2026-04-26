import { describe, expect, it } from "vitest";
import { ConfigSchemaError, parseSettings } from "../src/index.js";

describe("parseSettings", () => {
  it("accepts an empty object", () => {
    expect(parseSettings({})).toEqual({});
  });

  it("accepts scalar values", () => {
    const value = { LogLevel: "info", MaxRetries: 3, Enabled: true, Optional: null };
    expect(parseSettings(value)).toEqual(value);
  });

  it("accepts nested objects and arrays", () => {
    const value = {
      RetryPolicy: { attempts: 3, backoffSeconds: [1, 2, 4] },
      AllowedHosts: ["a.example", "b.example"],
    };
    expect(parseSettings(value)).toEqual(value);
  });

  it("rejects keys that are not valid names", () => {
    expect(() => parseSettings({ "1bad": "x" })).toThrow(ConfigSchemaError);
    expect(() => parseSettings({ "with space": "x" })).toThrow(ConfigSchemaError);
  });

  it("rejects unsupported value types", () => {
    expect(() => parseSettings({ Bad: () => 1 })).toThrow(ConfigSchemaError);
    expect(() => parseSettings({ Bad: new Date() })).toThrow(ConfigSchemaError);
  });

  it("rejects non-object inputs", () => {
    expect(() => parseSettings([])).toThrow(ConfigSchemaError);
    expect(() => parseSettings("string")).toThrow(ConfigSchemaError);
    expect(() => parseSettings(null)).toThrow(ConfigSchemaError);
  });
});
