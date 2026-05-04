import { describe, expect, it } from "vitest";
import { computeUpgradeProposals } from "../src/jobs/framework-version-check.js";

describe("computeUpgradeProposals", () => {
  it("proposes an upgrade for a project pinned below the latest release", () => {
    const proposals = computeUpgradeProposals(
      [{ projectName: "demo-bot", pinnedVersion: "1.5.0" }],
      [
        { version: "1.5.0", jsonReady: false },
        { version: "2.0.0", jsonReady: true },
      ],
    );
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({
      projectName: "demo-bot",
      fromVersion: "1.5.0",
      toVersion: "2.0.0",
      fromVersionJsonReady: false,
      toVersionJsonReady: true,
    });
  });

  it("returns no proposals when every project is up to date", () => {
    const proposals = computeUpgradeProposals(
      [{ projectName: "x", pinnedVersion: "2.0.0" }],
      [{ version: "2.0.0", jsonReady: true }],
    );
    expect(proposals).toHaveLength(0);
  });

  it("returns no proposals when there are no releases registered", () => {
    expect(computeUpgradeProposals([{ projectName: "x", pinnedVersion: "1.0.0" }], [])).toHaveLength(0);
  });
});
