import { describe, expect, it } from "vitest";
import { ConstantsFile } from "../src/constants.js";

describe("ConstantsFile", () => {
  it("accepts the same value-shape as SettingsFile", () => {
    const result = ConstantsFile.safeParse({
      schemaVersion: 1,
      constants: {
        FrameworkVersion: "1.2.3",
        MaxConsecutiveFailures: 5,
        IsProductionMode: false,
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects array values", () => {
    const result = ConstantsFile.safeParse({
      schemaVersion: 1,
      constants: { Tags: ["a", "b"] },
    });
    expect(result.success).toBe(false);
  });
});
