import { describe, expect, it } from "vitest";
import { TENANTS, isTenantName } from "../src/tenants.js";

describe("tenants", () => {
  it("exposes the four canonical tenants in fixed order", () => {
    expect([...TENANTS]).toEqual(["dev", "test", "stage", "prod"]);
  });

  it("isTenantName narrows strings to TenantName", () => {
    expect(isTenantName("dev")).toBe(true);
    expect(isTenantName("test")).toBe(true);
    expect(isTenantName("staging")).toBe(false);
    expect(isTenantName("")).toBe(false);
    expect(isTenantName(undefined)).toBe(false);
    expect(isTenantName(42)).toBe(false);
  });
});
