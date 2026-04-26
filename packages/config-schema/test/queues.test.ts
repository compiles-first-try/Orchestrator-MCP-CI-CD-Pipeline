import { describe, expect, it } from "vitest";
import { ConfigSchemaError, parseQueues } from "../src/index.js";

describe("parseQueues", () => {
  it("accepts a minimal queue and applies defaults", () => {
    const result = parseQueues([{ name: "Invoices" }]);
    expect(result[0]).toEqual({
      name: "Invoices",
      acceptAutoRetry: false,
      maxRetries: 1,
      enforceUniqueReferences: true,
    });
  });

  it("respects explicit values over defaults", () => {
    const result = parseQueues([
      {
        name: "Heavy",
        description: "long jobs",
        acceptAutoRetry: true,
        maxRetries: 5,
        slaMinutes: 30,
        enforceUniqueReferences: false,
      },
    ]);
    expect(result[0]?.maxRetries).toBe(5);
    expect(result[0]?.slaMinutes).toBe(30);
  });

  it("rejects maxRetries out of range", () => {
    expect(() => parseQueues([{ name: "X", maxRetries: -1 }])).toThrow(ConfigSchemaError);
    expect(() => parseQueues([{ name: "X", maxRetries: 11 }])).toThrow(ConfigSchemaError);
  });

  it("rejects non-positive slaMinutes", () => {
    expect(() => parseQueues([{ name: "X", slaMinutes: 0 }])).toThrow(ConfigSchemaError);
    expect(() => parseQueues([{ name: "X", slaMinutes: -5 }])).toThrow(ConfigSchemaError);
  });

  it("rejects duplicate names", () => {
    expect(() => parseQueues([{ name: "Same" }, { name: "Same" }])).toThrow(ConfigSchemaError);
  });
});
