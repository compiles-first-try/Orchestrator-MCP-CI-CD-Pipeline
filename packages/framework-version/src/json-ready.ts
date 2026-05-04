import { FrameworkReleaseNotFoundError } from "./errors.js";
import { parseVersion } from "./semver.js";

// Minimal shape — enough for the platform's "do we still need to write
// legacy Excel?" decision. Larger consumers (UI, audit) can use the full
// row from packages/db, but this package stays leaf-level by accepting only
// what it needs.
export interface FrameworkReleaseLookup {
  readonly version: string;
  readonly jsonReady: boolean;
}

// Returns true when the project's pinned framework version corresponds to
// a release marked `json_ready=true`. The reconciler / config-output uses
// this to decide whether the legacy `Config.xlsx` companion file still
// needs to be written.
export function isJsonReady(pinnedVersion: string, releases: readonly FrameworkReleaseLookup[]): boolean {
  // parseVersion validates the pinned version string. Throws
  // FrameworkVersionInvalidError on malformed input.
  parseVersion(pinnedVersion);

  const release = releases.find((candidate) => candidate.version === pinnedVersion);
  if (release === undefined) {
    throw new FrameworkReleaseNotFoundError(pinnedVersion);
  }
  return release.jsonReady;
}
