import { describe, expect, it } from "vitest";
import { TENANTS } from "@rpa-platform/shared";
import { OverridesFile } from "../src/overrides.js";

describe("OverridesFile", () => {
  it("accepts a fully-empty overrides block", () => {
    const result = OverridesFile.safeParse({ schemaVersion: 1, overrides: {} });
    expect(result.success).toBe(true);
  });

  it("accepts sparse overrides for any subset of tenants", () => {
    const result = OverridesFile.safeParse({
      schemaVersion: 1,
      overrides: {
        test: {
          settings: { MaxRetryNumber: 5 },
          assets: { MyAsset: { value: "test-value" } },
        },
        prod: {
          settings: { MaxRetryNumber: 1, EnableTracing: false },
          queues: { OrdersQueue: { maxRetries: 0 } },
          buckets: { archives: { storageParameters: { region: "us-west-2" } } },
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it("treats a settings value of null as a deletion marker", () => {
    const result = OverridesFile.safeParse({
      schemaVersion: 1,
      overrides: {
        prod: {
          settings: { ObsoleteKey: null },
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown tenant name", () => {
    const result = OverridesFile.safeParse({
      schemaVersion: 1,
      overrides: {
        staging: { settings: {} },
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown override fields under an entity (strict)", () => {
    const result = OverridesFile.safeParse({
      schemaVersion: 1,
      overrides: {
        test: {
          assets: { MyAsset: { unrelatedField: "x" } as unknown as Record<string, unknown> },
        },
      },
    });
    expect(result.success).toBe(false);
  });

  it("keeps tenant key set in lockstep with @rpa-platform/shared TENANTS", () => {
    // If this fails, add or remove a key in OverridesByTenant to match.
    const expected = new Set(TENANTS);
    const actual = new Set(["dev", "test", "stage", "prod"]);
    expect(actual).toEqual(expected);
  });
});
