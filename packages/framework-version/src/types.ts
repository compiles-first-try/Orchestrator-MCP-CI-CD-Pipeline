export interface SemVer {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly prerelease: readonly string[];
  readonly raw: string;
}

export interface FrameworkReleaseSummary {
  readonly version: string;
  readonly jsonReady: boolean;
}
