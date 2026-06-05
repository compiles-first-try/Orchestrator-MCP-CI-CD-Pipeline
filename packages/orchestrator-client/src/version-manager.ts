export interface CicdVersionResult {
  readonly version: string;
  readonly wasBumped: boolean;
  readonly bumpReason?: string;
}

// Given a developer version like "1.0.0" and the list of versions already
// in Orchestrator for that package, compute the version to upload. If the
// exact version exists, we append a -cicd.N prerelease suffix and increment
// N until we find a free slot.
//
// Examples:
//   devVersion="1.0.0", existing=[]             → "1.0.0" (fresh upload)
//   devVersion="1.0.0", existing=["1.0.0"]      → "1.0.0-cicd.1" (same version, new code)
//   devVersion="1.0.0", existing=["1.0.0","1.0.0-cicd.1"] → "1.0.0-cicd.2"
//   devVersion="1.0.0-cicd.1", existing=["1.0.0-cicd.1"]  → "1.0.0-cicd.2"
export function computeCicdVersion(
  devVersion: string,
  existingVersions: readonly string[],
): CicdVersionResult {
  const existingSet = new Set(existingVersions);

  if (!existingSet.has(devVersion)) {
    return { version: devVersion, wasBumped: false };
  }

  const baseVersion = stripCicdSuffix(devVersion);
  let maxCicdNumber = 0;

  for (const v of existingVersions) {
    const parsed = parseCicdSuffix(v);
    if (parsed !== undefined && parsed.base === baseVersion) {
      maxCicdNumber = Math.max(maxCicdNumber, parsed.cicdNumber);
    }
  }

  const nextCicd = maxCicdNumber + 1;
  const version = `${baseVersion}-cicd.${nextCicd}`;

  return {
    version,
    wasBumped: true,
    bumpReason: `Version ${devVersion} already exists in Orchestrator; bumped to ${version}`,
  };
}

export function stripCicdSuffix(version: string): string {
  return version.replace(/-cicd\.\d+$/u, "");
}

export function parseCicdSuffix(
  version: string,
): { base: string; cicdNumber: number } | undefined {
  const match = version.match(/^(.+)-cicd\.(\d+)$/u);
  if (match === null) return undefined;
  const base = match[1];
  const num = match[2];
  if (base === undefined || num === undefined) return undefined;
  return { base, cicdNumber: parseInt(num, 10) };
}
