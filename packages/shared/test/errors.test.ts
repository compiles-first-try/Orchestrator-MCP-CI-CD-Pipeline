import { describe, expect, it } from "vitest";
import {
  NotImplementedError,
  PermissionDeniedError,
  RpaPlatformError,
  TenantNotConnectedError,
} from "../src/errors.js";

describe("RpaPlatformError", () => {
  it("carries a code and message", () => {
    const err = new RpaPlatformError("some.code", "boom");
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe("some.code");
    expect(err.message).toBe("boom");
    expect(err.name).toBe("RpaPlatformError");
  });

  it("preserves cause and correlationId", () => {
    const cause = new Error("root");
    const err = new RpaPlatformError("x", "y", { cause, correlationId: "corr-1" });
    expect(err.cause).toBe(cause);
    expect(err.correlationId).toBe("corr-1");
  });

  it("exposes optional details", () => {
    const err = new RpaPlatformError("x", "y", { details: { tenant: "dev" } });
    expect(err.details).toEqual({ tenant: "dev" });
  });

  it("subclasses inherit the base shape and report their own name", () => {
    const err = new NotImplementedError("AWS Secrets Manager");
    expect(err).toBeInstanceOf(RpaPlatformError);
    expect(err.code).toBe("not_implemented");
    expect(err.name).toBe("NotImplementedError");
    expect(err.message).toContain("AWS Secrets Manager");
  });

  it("PermissionDeniedError formats the permission key", () => {
    const err = new PermissionDeniedError("project.provision");
    expect(err.code).toBe("permission_denied");
    expect(err.message).toContain("project.provision");
  });

  it("TenantNotConnectedError matches the spec audit code", () => {
    const err = new TenantNotConnectedError("prod", "demo-bot");
    expect(err.code).toBe("reconcile.blocked_unconfigured_tenant");
    expect(err.message).toContain("/rpa tenant connect demo-bot prod");
  });
});
