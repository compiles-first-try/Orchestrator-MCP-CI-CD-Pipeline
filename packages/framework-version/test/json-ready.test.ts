import { describe, expect, it } from "vitest";
import { isJsonReady, type FrameworkReleaseLookup } from "../src/json-ready.js";
import { FrameworkReleaseNotFoundError, FrameworkVersionInvalidError } from "../src/errors.js";

const RELEASES: readonly FrameworkReleaseLookup[] = [
  { version: "1.0.0", jsonReady: false },
  { version: "1.5.0", jsonReady: false },
  { version: "2.0.0", jsonReady: true },
  { version: "2.1.0", jsonReady: true },
];

describe("isJsonReady", () => {
  it("returns true when the pinned release is marked json-ready", () => {
    expect(isJsonReady("2.0.0", RELEASES)).toBe(true);
    expect(isJsonReady("2.1.0", RELEASES)).toBe(true);
  });

  it("returns false when the pinned release is registered but not json-ready", () => {
    expect(isJsonReady("1.0.0", RELEASES)).toBe(false);
    expect(isJsonReady("1.5.0", RELEASES)).toBe(false);
  });

  it("throws FrameworkReleaseNotFoundError for an unregistered version", () => {
    let caught: unknown;
    try {
      isJsonReady("9.9.9", RELEASES);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(FrameworkReleaseNotFoundError);
    if (caught instanceof FrameworkReleaseNotFoundError) {
      expect(caught.code).toBe("framework.release_not_found");
      expect(caught.version).toBe("9.9.9");
    }
  });

  it("throws FrameworkVersionInvalidError for malformed pinned versions", () => {
    expect(() => isJsonReady("not-a-version", RELEASES)).toThrow(FrameworkVersionInvalidError);
  });

  it("throws even when releases are empty", () => {
    expect(() => isJsonReady("1.0.0", [])).toThrow(FrameworkReleaseNotFoundError);
  });
});
