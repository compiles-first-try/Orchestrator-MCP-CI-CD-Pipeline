import { describe, expect, it } from "vitest";
import { TENANTS } from "@rpa-platform/shared";
import { SEED_FRAMEWORK_RELEASES, SEED_PROJECT, SEED_TENANTS, SEED_USERS } from "../src/data.js";

describe("seed data", () => {
  it("includes a json-ready and a non-json-ready framework release", () => {
    const ready = SEED_FRAMEWORK_RELEASES.filter((r) => r.jsonReady);
    const notReady = SEED_FRAMEWORK_RELEASES.filter((r) => r.jsonReady === false);
    expect(ready.length).toBeGreaterThan(0);
    expect(notReady.length).toBeGreaterThan(0);
  });

  it("seeds one tenant row per known TenantName", () => {
    expect(SEED_TENANTS).toHaveLength(TENANTS.length);
    const names = SEED_TENANTS.map((t) => t.tenantName).sort();
    expect(names).toEqual([...TENANTS].sort());
  });

  it("starts every tenant in pending_credentials per spec invariant 7", () => {
    for (const tenant of SEED_TENANTS) {
      expect(tenant.status).toBe("pending_credentials");
    }
  });

  it("seeds at least one user per system role", () => {
    const roleSet = new Set(SEED_USERS.flatMap((u) => u.roles));
    expect(roleSet.has("developer")).toBe(true);
    expect(roleSet.has("admin")).toBe(true);
    expect(roleSet.has("ba")).toBe(true);
  });

  it("project pins a json-ready framework version", () => {
    const release = SEED_FRAMEWORK_RELEASES.find(
      (r) => r.version === SEED_PROJECT.frameworkVersionPinned,
    );
    expect(release?.jsonReady).toBe(true);
  });
});
