import { describe, expect, it } from "vitest";
import { compareSemVer, compareVersions } from "../src/compare.js";
import { parseVersion } from "../src/parse.js";

describe("compareVersions", () => {
  it("returns 0 for equal versions", () => {
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
  });

  it("orders by major", () => {
    expect(compareVersions("1.0.0", "2.0.0")).toBe(-1);
    expect(compareVersions("2.0.0", "1.0.0")).toBe(1);
  });

  it("orders by minor when majors match", () => {
    expect(compareVersions("1.1.0", "1.2.0")).toBe(-1);
    expect(compareVersions("1.10.0", "1.2.0")).toBe(1);
  });

  it("orders by patch when major+minor match", () => {
    expect(compareVersions("1.0.1", "1.0.2")).toBe(-1);
    expect(compareVersions("1.0.2", "1.0.1")).toBe(1);
  });

  it("treats prerelease versions as lower than the corresponding release", () => {
    expect(compareVersions("1.0.0-alpha", "1.0.0")).toBe(-1);
    expect(compareVersions("1.0.0", "1.0.0-alpha")).toBe(1);
  });

  it("orders prerelease identifiers per semver §11", () => {
    expect(compareVersions("1.0.0-alpha", "1.0.0-alpha.1")).toBe(-1);
    expect(compareVersions("1.0.0-alpha.1", "1.0.0-alpha.beta")).toBe(-1);
    expect(compareVersions("1.0.0-alpha.beta", "1.0.0-beta")).toBe(-1);
    expect(compareVersions("1.0.0-beta", "1.0.0-beta.2")).toBe(-1);
    expect(compareVersions("1.0.0-beta.2", "1.0.0-beta.11")).toBe(-1);
    expect(compareVersions("1.0.0-beta.11", "1.0.0-rc.1")).toBe(-1);
    expect(compareVersions("1.0.0-rc.1", "1.0.0")).toBe(-1);
  });

  it("ignores build metadata when comparing", () => {
    expect(compareVersions("1.2.3+build.1", "1.2.3+build.2")).toBe(0);
    expect(compareVersions("1.2.3+build.1", "1.2.3")).toBe(0);
  });

  it("compareSemVer accepts already-parsed SemVer values", () => {
    expect(compareSemVer(parseVersion("1.2.3"), parseVersion("1.2.4"))).toBe(-1);
  });
});
