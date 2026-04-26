import { parseVersion } from "./parse.js";
import type { SemVer } from "./types.js";

export type ComparisonResult = -1 | 0 | 1;

const NUMERIC_IDENTIFIER = /^\d+$/;

function sign(n: number): ComparisonResult {
  if (n < 0) return -1;
  if (n > 0) return 1;
  return 0;
}

function compareIdentifier(a: string, b: string): ComparisonResult {
  const aNumeric = NUMERIC_IDENTIFIER.test(a);
  const bNumeric = NUMERIC_IDENTIFIER.test(b);
  if (aNumeric && bNumeric) {
    return sign(Number(a) - Number(b));
  }
  // Per semver §11: numeric identifiers always have lower precedence than alphanumeric.
  if (aNumeric) return -1;
  if (bNumeric) return 1;
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function comparePrerelease(a: readonly string[], b: readonly string[]): ComparisonResult {
  // Per semver §11: a version with prerelease has lower precedence than one without.
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1;
  if (b.length === 0) return -1;
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    const aId = a[i];
    const bId = b[i];
    if (aId === undefined || bId === undefined) break;
    const result = compareIdentifier(aId, bId);
    if (result !== 0) return result;
  }
  return sign(a.length - b.length);
}

export function compareSemVer(a: SemVer, b: SemVer): ComparisonResult {
  if (a.major !== b.major) return sign(a.major - b.major);
  if (a.minor !== b.minor) return sign(a.minor - b.minor);
  if (a.patch !== b.patch) return sign(a.patch - b.patch);
  return comparePrerelease(a.prerelease, b.prerelease);
}

export function compareVersions(a: string, b: string): ComparisonResult {
  return compareSemVer(parseVersion(a), parseVersion(b));
}
