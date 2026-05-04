import { describe, expect, it, vi } from "vitest";
import type { ConfigOutputWriter } from "@rpa-platform/config-output";
import type { GithubClient } from "@rpa-platform/github-client";
import {
  ProjectProvisioningError,
  ProjectProvisioningService,
} from "../src/services/project-provisioning.js";

function fakeGithub(impl?: Partial<{ createRepoFromTemplate: () => Promise<unknown> }>): GithubClient {
  const createRepoFromTemplate =
    impl?.createRepoFromTemplate ??
    vi.fn(async () => ({ htmlUrl: "https://github.com/owner/demo-bot", cloneUrl: "git@..." }));
  return { createRepoFromTemplate } as unknown as GithubClient;
}

function fakeConfigOutput(): ConfigOutputWriter {
  return {
    resolve: vi.fn(),
    writeToBucket: vi.fn(async () => ({ jsonBytes: 200, xlsxBytes: undefined, wroteLegacyExcel: false })),
  } as unknown as ConfigOutputWriter;
}

const TEMPLATE = { owner: "compiles-first-try", repo: "rpa-template" };

describe("ProjectProvisioningService.provision", () => {
  it("creates the repo and skips the seed step when no tenant context is supplied", async () => {
    const github = fakeGithub();
    const configOutput = fakeConfigOutput();
    const service = new ProjectProvisioningService({ github, configOutput });
    const result = await service.provision({
      intent: { name: "demo-bot", description: "x", owners: [], frameworkVersion: undefined },
      projectRepoOwner: "owner",
      template: TEMPLATE,
      pinnedFrameworkVersion: "1.0.0",
    });
    expect(result.repo).toEqual({ owner: "owner", repo: "demo-bot" });
    expect(result.repoUrl).toBe("https://github.com/owner/demo-bot");
    expect(result.seedConfigSkipped).toBe(true);
    expect((configOutput.writeToBucket as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it("creates the repo AND writes Config.json when tenant context is supplied", async () => {
    const github = fakeGithub();
    const configOutput = fakeConfigOutput();
    const service = new ProjectProvisioningService({ github, configOutput });
    const result = await service.provision({
      intent: { name: "demo-bot", description: "x", owners: [], frameworkVersion: undefined },
      projectRepoOwner: "owner",
      template: TEMPLATE,
      pinnedFrameworkVersion: "1.0.0",
      devBucketId: 42,
      devFolderId: 1,
    });
    expect(result.seedConfigSkipped).toBe(false);
    expect(result.initialConfigBytes).toBe(200);
    expect((configOutput.writeToBucket as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it("wraps GitHub creation failures as ProjectProvisioningError", async () => {
    const github = fakeGithub({
      createRepoFromTemplate: vi.fn(async () => {
        throw new Error("repo already exists");
      }),
    });
    const service = new ProjectProvisioningService({ github, configOutput: fakeConfigOutput() });
    await expect(
      service.provision({
        intent: { name: "demo-bot", description: "x", owners: [], frameworkVersion: undefined },
        projectRepoOwner: "owner",
        template: TEMPLATE,
        pinnedFrameworkVersion: "1.0.0",
      }),
    ).rejects.toBeInstanceOf(ProjectProvisioningError);
  });
});
