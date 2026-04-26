import { describe, expect, it } from "vitest";
import {
  firstJsonReadyVersion,
  isJsonReady,
  shouldWriteLegacyExcel,
  UnknownReleaseError,
} from "../src/json-ready.js";
import type { FrameworkReleaseSummary } from "../src/types.js";
import { RpaPlatformError } from "@rpa-platform/shared";

const releases: readonly FrameworkReleaseSummary[] = [
  { version: "1.0.0", jsonReady: false },
  { version: "1.1.0", jsonReady: false },
  { version: "2.0.0", jsonReady: true },
  { version: "2.1.0", jsonReady: true },
];

describe("isJsonReady", () => {
  it("returns true when the pinned release is json-ready", () => {
    expect(isJsonReady("2.0.0", releases)).toBe(true);
    expect(isJsonReady("2.1.0", releases)).toBe(true);
  });

  it("returns false when the pinned release predates JSON support", () => {
    expect(isJsonReady("1.0.0", releases)).toBe(false);
    expect(isJsonReady("1.1.0", releases)).toBe(false);
  });

  it("matches releases by parsed semver, not raw string", () => {
    const equivalents: FrameworkReleaseSummary[] = [{ version: "1.2.3+build.7", jsonReady: true }];
    expect(isJsonReady("1.2.3+build.999", equivalents)).toBe(true);
  });

  it("throws UnknownReleaseError when the pinned version is not registered", () => {
    expect(() => isJsonReady("9.9.9", releases)).toThrow(UnknownReleaseError);
  });

  it("attaches the spec error code on UnknownReleaseError", () => {
    try {
      isJsonReady("9.9.9", releases);
      expect.fail("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(RpaPlatformError);
      expect((err as RpaPlatformError).code).toBe("framework_version.unknown_release");
    }
  });

  it("throws when the pinned version is not a valid semver string", () => {
    expect(() => isJsonReady("not-a-version", releases)).toThrow();
  });

  it("throws when an empty release list is supplied", () => {
    expect(() => isJsonReady("1.0.0", [])).toThrow(UnknownReleaseError);
  });
});

describe("shouldWriteLegacyExcel", () => {
  it("is the inverse of isJsonReady for known versions", () => {
    expect(shouldWriteLegacyExcel("1.0.0", releases)).toBe(true);
    expect(shouldWriteLegacyExcel("2.0.0", releases)).toBe(false);
  });
});

describe("firstJsonReadyVersion", () => {
  it("returns the smallest json-ready version", () => {
    expect(firstJsonReadyVersion(releases)).toBe("2.0.0");
  });

  it("returns null when no release is json-ready", () => {
    const noneReady: FrameworkReleaseSummary[] = [
      { version: "1.0.0", jsonReady: false },
      { version: "1.1.0", jsonReady: false },
    ];
    expect(firstJsonReadyVersion(noneReady)).toBeNull();
  });

  it("returns null for an empty list", () => {
    expect(firstJsonReadyVersion([])).toBeNull();
  });

  it("does not assume input is sorted", () => {
    const unsorted: FrameworkReleaseSummary[] = [
      { version: "3.0.0", jsonReady: true },
      { version: "2.5.0", jsonReady: true },
      { version: "2.0.0", jsonReady: true },
      { version: "1.0.0", jsonReady: false },
    ];
    expect(firstJsonReadyVersion(unsorted)).toBe("2.0.0");
  });

  it("ignores non-json-ready entries even if they are smaller", () => {
    const mixed: FrameworkReleaseSummary[] = [
      { version: "0.9.0", jsonReady: false },
      { version: "1.0.0", jsonReady: true },
      { version: "2.0.0", jsonReady: true },
    ];
    expect(firstJsonReadyVersion(mixed)).toBe("1.0.0");
  });

  it("handles prerelease ordering correctly", () => {
    const withPrereleases: FrameworkReleaseSummary[] = [
      { version: "2.0.0-rc.1", jsonReady: true },
      { version: "2.0.0", jsonReady: true },
    ];
    expect(firstJsonReadyVersion(withPrereleases)).toBe("2.0.0-rc.1");
  });
});
