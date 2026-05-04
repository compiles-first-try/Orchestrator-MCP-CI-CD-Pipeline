import { describe, expect, it } from "vitest";
import { RpaPlatformError } from "@rpa-platform/shared";
import { AssetsFile } from "../src/assets.js";
import { ConfigSchemaError, parseConfig } from "../src/parse.js";

describe("parseConfig", () => {
  it("returns parsed data on a valid input", () => {
    const data = {
      schemaVersion: 1,
      assets: [{ name: "OK", type: "text", value: "hi" }],
    };
    const parsed = parseConfig(AssetsFile, data, { source: "assets.json" });
    expect(parsed.assets).toHaveLength(1);
    expect(parsed.assets[0]?.name).toBe("OK");
  });

  it("throws ConfigSchemaError with the source filename and zod issues", () => {
    const data = {
      schemaVersion: 1,
      assets: [{ name: "Bad Name", type: "text", value: "hi" }],
    };
    let caught: unknown;
    try {
      parseConfig(AssetsFile, data, { source: "assets.json" });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ConfigSchemaError);
    expect(caught).toBeInstanceOf(RpaPlatformError);
    if (caught instanceof ConfigSchemaError) {
      expect(caught.code).toBe("config.schema_invalid");
      expect(caught.source).toBe("assets.json");
      expect(caught.issues.length).toBeGreaterThan(0);
      expect(caught.message).toContain("assets.json failed schema validation");
    }
  });

  it("propagates correlationId into the thrown error", () => {
    let caught: unknown;
    try {
      parseConfig(
        AssetsFile,
        { schemaVersion: 99, assets: [] },
        { source: "assets.json", correlationId: "corr-1" },
      );
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ConfigSchemaError);
    if (caught instanceof ConfigSchemaError) {
      expect(caught.correlationId).toBe("corr-1");
    }
  });
});
