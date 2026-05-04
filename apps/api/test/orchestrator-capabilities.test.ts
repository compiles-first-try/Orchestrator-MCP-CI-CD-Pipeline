import { describe, expect, it } from "vitest";
import { PermissionDeniedError } from "@rpa-platform/shared";
import {
  PLATFORM_ACTION_REQUIREMENTS,
  checkCapability,
  computeUserCapabilities,
  requireCapability,
} from "../src/orchestrator-capabilities.js";

describe("computeUserCapabilities", () => {
  it("unions capabilities across multiple roles", () => {
    const caps = computeUserCapabilities(["Developer", "Business Analyst"]);
    expect(caps).toContain("Assets.Edit");
    expect(caps).toContain("Storage Buckets.View");
  });

  it("ignores roles with no known capability profile", () => {
    expect(computeUserCapabilities(["NotARealRole"])).toHaveLength(0);
  });

  it("merges in extra capability mappings for custom roles", () => {
    const caps = computeUserCapabilities(["MyCustomRole"], {
      MyCustomRole: ["Assets.View", "Queues.View"],
    });
    expect(caps).toEqual(expect.arrayContaining(["Assets.View", "Queues.View"]));
  });
});

describe("checkCapability", () => {
  it("ok=true when the user's roles cover every required capability", () => {
    const result = checkCapability(["Administrator"], "reconcile.apply");
    expect(result.ok).toBe(true);
    expect(result.missing).toHaveLength(0);
  });

  it("ok=false when capabilities are missing, with missing list populated", () => {
    const result = checkCapability(["Business Analyst"], "reconcile.apply");
    expect(result.ok).toBe(false);
    expect(result.missing.length).toBeGreaterThan(0);
    // BA shouldn't be allowed to create assets.
    expect(result.missing).toContain("Assets.Create");
  });

  it("ok=true for a Developer doing dry-run (read-only)", () => {
    const result = checkCapability(["Developer"], "reconcile.dry_run");
    expect(result.ok).toBe(true);
  });

  it("reconcile.apply and reconcile.dry_run never require a *.Delete capability", () => {
    // The additive path (apply / dry-run) intentionally excludes deletes
    // — the platform's tiered delete policy keeps them off the standard
    // route. Only `reconcile.apply_with_deletes` opts in (asserted below).
    for (const action of ["reconcile.apply", "reconcile.dry_run", "tenant.connect"] as const) {
      for (const cap of PLATFORM_ACTION_REQUIREMENTS[action]) {
        expect(cap.endsWith(".Delete")).toBe(false);
      }
    }
  });

  it("reconcile.apply_with_deletes requires every *.Delete capability the platform might call", () => {
    const requirements = PLATFORM_ACTION_REQUIREMENTS["reconcile.apply_with_deletes"];
    expect(requirements).toContain("Assets.Delete");
    expect(requirements).toContain("Queues.Delete");
    expect(requirements).toContain("Storage Buckets.Delete");
    expect(requirements).toContain("Storage Files.Delete");
  });

  it("Developer role lacks *.Delete capabilities by default — apply_with_deletes fails for a Developer", () => {
    const result = checkCapability(["Developer"], "reconcile.apply_with_deletes");
    expect(result.ok).toBe(false);
    expect(result.missing).toContain("Assets.Delete");
  });

  it("Administrator role covers reconcile.apply_with_deletes", () => {
    const result = checkCapability(["Administrator"], "reconcile.apply_with_deletes");
    expect(result.ok).toBe(true);
  });
});

describe("requireCapability", () => {
  it("returns the result on success", () => {
    const result = requireCapability(["Administrator"], "reconcile.apply");
    expect(result.ok).toBe(true);
  });

  it("throws PermissionDeniedError with details.missing on failure", () => {
    let caught: unknown;
    try {
      requireCapability(["Business Analyst"], "reconcile.apply", {
        correlationId: "corr-1",
        tenant: "test",
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(PermissionDeniedError);
    if (caught instanceof PermissionDeniedError) {
      expect(caught.code).toBe("permission_denied");
      expect(caught.correlationId).toBe("corr-1");
      const details = caught.details as { action?: string; tenant?: string; missing?: string[] };
      expect(details?.action).toBe("reconcile.apply");
      expect(details?.tenant).toBe("test");
      expect((details?.missing ?? []).length).toBeGreaterThan(0);
    }
  });
});
