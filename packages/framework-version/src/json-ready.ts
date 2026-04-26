import { RpaPlatformError } from "@rpa-platform/shared";
import { compareSemVer } from "./compare.js";
import { parseVersion } from "./parse.js";
import type { FrameworkReleaseSummary } from "./types.js";

export class UnknownReleaseError extends RpaPlatformError {
  constructor(version: string) {
    super(
      "framework_version.unknown_release",
      `No framework release registered for version '${version}'.`,
      { details: { version } },
    );
  }
}

export function isJsonReady(
  pinnedVersion: string,
  releases: readonly FrameworkReleaseSummary[],
): boolean {
  const pinned = parseVersion(pinnedVersion);
  for (const release of releases) {
    const candidate = parseVersion(release.version);
    if (compareSemVer(candidate, pinned) === 0) {
      return release.jsonReady;
    }
  }
  throw new UnknownReleaseError(pinnedVersion);
}

export function shouldWriteLegacyExcel(
  pinnedVersion: string,
  releases: readonly FrameworkReleaseSummary[],
): boolean {
  return isJsonReady(pinnedVersion, releases) === false;
}

export function firstJsonReadyVersion(releases: readonly FrameworkReleaseSummary[]): string | null {
  let smallest: FrameworkReleaseSummary | null = null;
  let smallestParsed = null;
  for (const release of releases) {
    if (release.jsonReady === false) continue;
    const parsed = parseVersion(release.version);
    if (smallest === null || smallestParsed === null) {
      smallest = release;
      smallestParsed = parsed;
      continue;
    }
    if (compareSemVer(parsed, smallestParsed) < 0) {
      smallest = release;
      smallestParsed = parsed;
    }
  }
  return smallest === null ? null : smallest.version;
}
