import { describe, expect, it } from "vitest";
import { SettingsFile } from "../src/settings.js";

describe("SettingsFile", () => {
  it("accepts string, number, boolean values", () => {
    const result = SettingsFile.safeParse({
      schemaVersion: 1,
      settings: {
        OrchestratorAlertsEmail: "alerts@example.com",
        MaxRetryNumber: 3,
        EnableTracing: true,
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects null values (use overrides for deletion semantics)", () => {
    const result = SettingsFile.safeParse({
      schemaVersion: 1,
      settings: { Maybe: null },
    });
    expect(result.success).toBe(false);
  });

  it("rejects nested object values", () => {
    const result = SettingsFile.safeParse({
      schemaVersion: 1,
      settings: { Nested: { a: 1 } },
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty key", () => {
    const result = SettingsFile.safeParse({
      schemaVersion: 1,
      settings: { "": "x" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a wrong schemaVersion", () => {
    const result = SettingsFile.safeParse({
      schemaVersion: 2,
      settings: {},
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-finite numbers", () => {
    const result = SettingsFile.safeParse({
      schemaVersion: 1,
      settings: { Bad: Number.POSITIVE_INFINITY },
    });
    expect(result.success).toBe(false);
  });
});
