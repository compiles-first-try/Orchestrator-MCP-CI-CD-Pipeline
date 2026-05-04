import { FrameworkVersionInvalidError } from "./errors.js";

// Official semver 2.0.0 regex from https://semver.org/. Build metadata
// (`+xxx`) is captured but ignored for compare.
const SEMVER_REGEX =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/u;

export type PrereleaseIdentifier = string | number;

export interface SemVer {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly prerelease: readonly PrereleaseIdentifier[];
  readonly raw: string;
}

export function parseVersion(input: string): SemVer {
  const match = SEMVER_REGEX.exec(input);
  if (match === null) {
    throw new FrameworkVersionInvalidError(input);
  }
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  const prereleaseRaw = match[4];
  const prerelease: PrereleaseIdentifier[] =
    prereleaseRaw === undefined
      ? []
      : prereleaseRaw.split(".").map((part) => (/^\d+$/u.test(part) ? Number(part) : part));
  return { major, minor, patch, prerelease, raw: input };
}

export function isValidVersion(input: string): boolean {
  return SEMVER_REGEX.test(input);
}

export function compareVersions(a: SemVer, b: SemVer): -1 | 0 | 1 {
  const main = compareNumber(a.major, b.major) ?? compareNumber(a.minor, b.minor) ?? compareNumber(a.patch, b.patch);
  if (main !== undefined) return main;

  // Per semver: a version without prerelease has higher precedence than the
  // same version with a prerelease tag.
  const aHas = a.prerelease.length > 0;
  const bHas = b.prerelease.length > 0;
  if (aHas && !bHas) return -1;
  if (!aHas && bHas) return 1;
  if (!aHas && !bHas) return 0;

  return comparePrerelease(a.prerelease, b.prerelease);
}

export function isAtLeast(version: string, threshold: string): boolean {
  const v = parseVersion(version);
  const t = parseVersion(threshold);
  return compareVersions(v, t) >= 0;
}

function comparePrerelease(a: readonly PrereleaseIdentifier[], b: readonly PrereleaseIdentifier[]): -1 | 0 | 1 {
  const minLen = Math.min(a.length, b.length);
  for (let i = 0; i < minLen; i++) {
    const ai = a[i];
    const bi = b[i];
    // Bounded by minLen — both are guaranteed defined; narrowing for the
    // type checker only.
    if (ai === undefined || bi === undefined) continue;
    const c = compareIdentifier(ai, bi);
    if (c !== 0) return c;
  }
  return compareNumber(a.length, b.length) ?? 0;
}

function compareIdentifier(a: PrereleaseIdentifier, b: PrereleaseIdentifier): -1 | 0 | 1 {
  const aIsNum = typeof a === "number";
  const bIsNum = typeof b === "number";
  if (aIsNum && bIsNum) {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }
  // Numeric identifiers have lower precedence than alphanumeric identifiers.
  if (aIsNum) return -1;
  if (bIsNum) return 1;
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function compareNumber(a: number, b: number): -1 | 1 | undefined {
  if (a < b) return -1;
  if (a > b) return 1;
  return undefined;
}
