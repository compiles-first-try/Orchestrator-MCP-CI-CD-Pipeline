import { compareVersions, parseVersion, type FrameworkReleaseLookup } from "@rpa-platform/framework-version";

// Periodic job: for each project, compare the pinned framework version
// against the latest registered release. If the project is behind, the
// platform proposes an upgrade (the spec says the platform proposes; an
// admin clicks Approve to actually open the bump PR — that side of the
// flow lives in apps/slack-bot).
//
// This module only computes the diff. The caller wires it to a scheduler
// (cron/setInterval) and to whichever messaging surface posts the proposal.

export interface ProjectFrameworkPin {
  readonly projectName: string;
  readonly pinnedVersion: string;
}

export interface UpgradeProposal {
  readonly projectName: string;
  readonly fromVersion: string;
  readonly toVersion: string;
  readonly fromVersionJsonReady: boolean;
  readonly toVersionJsonReady: boolean;
}

export function computeUpgradeProposals(
  projects: readonly ProjectFrameworkPin[],
  releases: readonly FrameworkReleaseLookup[],
): readonly UpgradeProposal[] {
  if (releases.length === 0) return [];
  const sorted = [...releases].sort((a, b) =>
    compareVersions(parseVersion(a.version), parseVersion(b.version)),
  );
  const latest = sorted.at(-1);
  if (latest === undefined) return [];

  const proposals: UpgradeProposal[] = [];
  for (const project of projects) {
    const pin = parseVersion(project.pinnedVersion);
    const cmp = compareVersions(pin, parseVersion(latest.version));
    if (cmp >= 0) continue;
    const fromRelease = sorted.find((r) => r.version === project.pinnedVersion);
    proposals.push({
      projectName: project.projectName,
      fromVersion: project.pinnedVersion,
      toVersion: latest.version,
      fromVersionJsonReady: fromRelease?.jsonReady ?? false,
      toVersionJsonReady: latest.jsonReady,
    });
  }
  return proposals;
}
