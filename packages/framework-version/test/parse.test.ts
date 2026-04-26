import { describe, expect, it } from "vitest";
import { InvalidVersionError, isValidVersion, parseVersion } from "../src/parse.js";
import { RpaPlatformError } from "@rpa-platform/shared";

describe("parseVersion", () => {
  it("parses a basic MAJOR.MINOR.PATCH", () => {
    expect(parseVersion("1.2.3")).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: [],
      raw: "1.2.3",
    });
  });

  it("parses 0.0.0", () => {
    const v = parseVersion("0.0.0");
    expect(v.major).toBe(0);
    expect(v.minor).toBe(0);
    expect(v.patch).toBe(0);
  });

  it("parses prerelease identifiers", () => {
    const v = parseVersion("1.0.0-alpha.1");
    expect(v.prerelease).toEqual(["alpha", "1"]);
  });

  it("parses a build metadata suffix without retaining it", () => {
    const v = parseVersion("1.2.3+build.456");
    expect(v.major).toBe(1);
    expect(v.prerelease).toEqual([]);
  });

  it("parses prerelease + build metadata together", () => {
    const v = parseVersion("1.2.3-rc.1+sha.abc");
    expect(v.prerelease).toEqual(["rc", "1"]);
  });

  it("rejects empty string", () => {
    expect(() => parseVersion("")).toThrow(InvalidVersionError);
  });

  it("rejects v-prefixed versions", () => {
    expect(() => parseVersion("v1.2.3")).toThrow(InvalidVersionError);
  });

  it("rejects two-part versions", () => {
    expect(() => parseVersion("1.2")).toThrow(InvalidVersionError);
  });

  it("rejects four-part versions", () => {
    expect(() => parseVersion("1.2.3.4")).toThrow(InvalidVersionError);
  });

  it("rejects leading zeros in numeric components", () => {
    expect(() => parseVersion("01.2.3")).toThrow(InvalidVersionError);
    expect(() => parseVersion("1.02.3")).toThrow(InvalidVersionError);
    expect(() => parseVersion("1.2.03")).toThrow(InvalidVersionError);
  });

  it("rejects negative components", () => {
    expect(() => parseVersion("-1.2.3")).toThrow(InvalidVersionError);
  });

  it("rejects non-string input", () => {
    expect(() => parseVersion(undefined as unknown as string)).toThrow(InvalidVersionError);
    expect(() => parseVersion(123 as unknown as string)).toThrow(InvalidVersionError);
  });

  it("rejects empty prerelease identifiers", () => {
    expect(() => parseVersion("1.2.3-")).toThrow(InvalidVersionError);
    expect(() => parseVersion("1.2.3-alpha..1")).toThrow(InvalidVersionError);
  });

  it("attaches the spec error code on the thrown error", () => {
    try {
      parseVersion("not-a-version");
      expect.fail("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(RpaPlatformError);
      expect((err as RpaPlatformError).code).toBe("framework_version.invalid");
    }
  });
});

describe("isValidVersion", () => {
  it("returns true for valid versions", () => {
    expect(isValidVersion("1.2.3")).toBe(true);
    expect(isValidVersion("0.0.0")).toBe(true);
    expect(isValidVersion("1.0.0-alpha")).toBe(true);
  });

  it("returns false for invalid input without throwing", () => {
    expect(isValidVersion("v1.0")).toBe(false);
    expect(isValidVersion("")).toBe(false);
    expect(isValidVersion("1.2.3.4")).toBe(false);
  });
});
