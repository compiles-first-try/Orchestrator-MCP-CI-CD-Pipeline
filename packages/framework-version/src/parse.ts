import { RpaPlatformError } from "@rpa-platform/shared";
import type { SemVer } from "./types.js";

const NUMERIC_IDENTIFIER = /^(0|[1-9]\d*)$/;
const ALPHANUMERIC_IDENTIFIER = /^[0-9A-Za-z-]+$/;

const VERSION_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export class InvalidVersionError extends RpaPlatformError {
  constructor(input: string) {
    super("framework_version.invalid", `Invalid framework version: '${input}'.`, {
      details: { input },
    });
  }
}

export function parseVersion(input: string): SemVer {
  if (typeof input !== "string") {
    throw new InvalidVersionError(String(input));
  }
  const match = VERSION_PATTERN.exec(input);
  if (match === null) {
    throw new InvalidVersionError(input);
  }
  const [, majorRaw, minorRaw, patchRaw, prereleaseRaw] = match;
  const prerelease = prereleaseRaw === undefined ? [] : prereleaseRaw.split(".");
  for (const identifier of prerelease) {
    if (!ALPHANUMERIC_IDENTIFIER.test(identifier)) {
      throw new InvalidVersionError(input);
    }
    if (NUMERIC_IDENTIFIER.test(identifier) === false && /^\d+$/.test(identifier)) {
      // Leading-zero numeric identifier: "01" is invalid per semver §9.
      throw new InvalidVersionError(input);
    }
  }
  return {
    major: Number(majorRaw),
    minor: Number(minorRaw),
    patch: Number(patchRaw),
    prerelease,
    raw: input,
  };
}

export function isValidVersion(input: string): boolean {
  try {
    parseVersion(input);
    return true;
  } catch {
    return false;
  }
}
