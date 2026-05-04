import { describe, expect, it } from "vitest";
import {
  compareVersions,
  isAtLeast,
  isValidVersion,
  parseVersion,
} from "../src/semver.js";
import { FrameworkVersionInvalidError } from "../src/errors.js";

describe("parseVersion", () => {
  it("parses major.minor.patch", () => {
    const v = parseVersion("1.2.3");
    expect(v).toMatchObject({ major: 1, minor: 2, patch: 3, prerelease: [], raw: "1.2.3" });
  });

  it("parses zero components", () => {
    const v = parseVersion("0.0.0");
    expect(v).toMatchObject({ major: 0, minor: 0, patch: 0, prerelease: [] });
  });

  it("parses a prerelease tag with mixed identifiers", () => {
    const v = parseVersion("1.2.3-alpha.7");
    expect(v.prerelease).toEqual(["alpha", 7]);
  });

  it("parses build metadata and ignores it for raw equality", () => {
    const v = parseVersion("1.2.3+build.99");
    expect(v).toMatchObject({ major: 1, minor: 2, patch: 3, prerelease: [] });
    expect(v.raw).toBe("1.2.3+build.99");
  });

  it("rejects leading zeros in numeric components", () => {
    expect(() => parseVersion("01.2.3")).toThrow(FrameworkVersionInvalidError);
    expect(() => parseVersion("1.02.3")).toThrow(FrameworkVersionInvalidError);
    expect(() => parseVersion("1.2.03")).toThrow(FrameworkVersionInvalidError);
  });

  it("rejects garbage", () => {
    expect(() => parseVersion("")).toThrow(FrameworkVersionInvalidError);
    expect(() => parseVersion("v1.2.3")).toThrow(FrameworkVersionInvalidError);
    expect(() => parseVersion("1.2")).toThrow(FrameworkVersionInvalidError);
    expect(() => parseVersion("1.2.3.4")).toThrow(FrameworkVersionInvalidError);
  });

  it("attaches the input string to the thrown error", () => {
    let caught: unknown;
    try {
      parseVersion("not-a-version");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(FrameworkVersionInvalidError);
    if (caught instanceof FrameworkVersionInvalidError) {
      expect(caught.input).toBe("not-a-version");
      expect(caught.code).toBe("framework.version_invalid");
    }
  });
});

describe("isValidVersion", () => {
  it("returns true for valid versions", () => {
    expect(isValidVersion("1.2.3")).toBe(true);
    expect(isValidVersion("0.0.0-alpha")).toBe(true);
  });

  it("returns false for invalid versions", () => {
    expect(isValidVersion("1.2")).toBe(false);
    expect(isValidVersion("v1.2.3")).toBe(false);
  });
});

describe("compareVersions", () => {
  it("compares major precedence", () => {
    expect(compareVersions(parseVersion("1.0.0"), parseVersion("2.0.0"))).toBe(-1);
    expect(compareVersions(parseVersion("2.0.0"), parseVersion("1.99.99"))).toBe(1);
  });

  it("compares minor precedence", () => {
    expect(compareVersions(parseVersion("1.2.0"), parseVersion("1.10.0"))).toBe(-1);
  });

  it("compares patch precedence", () => {
    expect(compareVersions(parseVersion("1.2.3"), parseVersion("1.2.4"))).toBe(-1);
  });

  it("treats no-prerelease as higher than same version with prerelease", () => {
    expect(compareVersions(parseVersion("1.0.0-alpha"), parseVersion("1.0.0"))).toBe(-1);
    expect(compareVersions(parseVersion("1.0.0"), parseVersion("1.0.0-alpha"))).toBe(1);
  });

  it("compares prereleases per semver §11.4 example", () => {
    // 1.0.0-alpha < 1.0.0-alpha.1 < 1.0.0-alpha.beta < 1.0.0-beta
    //   < 1.0.0-beta.2 < 1.0.0-beta.11 < 1.0.0-rc.1 < 1.0.0
    const order = [
      "1.0.0-alpha",
      "1.0.0-alpha.1",
      "1.0.0-alpha.beta",
      "1.0.0-beta",
      "1.0.0-beta.2",
      "1.0.0-beta.11",
      "1.0.0-rc.1",
      "1.0.0",
    ].map(parseVersion);
    for (let i = 0; i < order.length - 1; i++) {
      const a = order[i];
      const b = order[i + 1];
      if (a === undefined || b === undefined) continue;
      expect(compareVersions(a, b)).toBe(-1);
      expect(compareVersions(b, a)).toBe(1);
    }
  });

  it("returns 0 for identical versions", () => {
    expect(compareVersions(parseVersion("1.2.3"), parseVersion("1.2.3"))).toBe(0);
    expect(compareVersions(parseVersion("1.2.3-alpha.1"), parseVersion("1.2.3-alpha.1"))).toBe(0);
  });

  it("ignores build metadata", () => {
    expect(compareVersions(parseVersion("1.2.3+a"), parseVersion("1.2.3+b"))).toBe(0);
  });
});

describe("isAtLeast", () => {
  it("is true when version is greater than or equal to threshold", () => {
    expect(isAtLeast("1.2.3", "1.2.3")).toBe(true);
    expect(isAtLeast("2.0.0", "1.99.99")).toBe(true);
  });

  it("is false when version is below threshold", () => {
    expect(isAtLeast("1.2.0", "1.2.3")).toBe(false);
    expect(isAtLeast("1.0.0-alpha", "1.0.0")).toBe(false);
  });

  it("throws for invalid input", () => {
    expect(() => isAtLeast("garbage", "1.0.0")).toThrow(FrameworkVersionInvalidError);
    expect(() => isAtLeast("1.0.0", "garbage")).toThrow(FrameworkVersionInvalidError);
  });
});
