import {
  AssetsFile,
  BucketsFile,
  ConstantsFile,
  CredentialsFile,
  OverridesFile,
  QueuesFile,
  SettingsFile,
} from "@rpa-platform/config-schema";
import type { ConfigOutputWriter } from "@rpa-platform/config-output";
import type { GithubClient, RepoSlug } from "@rpa-platform/github-client";
import { RpaPlatformError } from "@rpa-platform/shared";
import type { ProjectIntent } from "../intent/parser.js";

export class ProjectProvisioningError extends RpaPlatformError {
  constructor(message: string, code = "project.provision_failed", details?: Readonly<Record<string, unknown>>) {
    super(code, message, details === undefined ? {} : { details });
  }
}

export type TemplateRef = RepoSlug;

export interface ProvisionInput {
  readonly intent: ProjectIntent;
  // Where the new repo will live (org/owner). Repo name = intent.name.
  readonly projectRepoOwner: string;
  // Template the new repo is generated from.
  readonly template: TemplateRef;
  // Dev tenant context for the seed Config.json drop. Both must be supplied
  // together (or neither). When omitted the repo is still created and the
  // bucket-write step is skipped — the admin runs `/rpa tenant connect`
  // afterwards to populate the seed.
  readonly devBucketId?: number;
  readonly devFolderId?: string | number;
  readonly pinnedFrameworkVersion: string;
  readonly correlationId?: string;
}

export interface ProvisionResult {
  readonly repo: RepoSlug;
  readonly repoUrl: string;
  readonly initialConfigBytes: number | undefined;
  readonly seedConfigSkipped: boolean;
}

export interface ProjectProvisioningDeps {
  readonly github: GithubClient;
  readonly configOutput: ConfigOutputWriter;
}

// Orchestrates the new-project flow:
//   1. Generate a new repo from the configurable template (GitHub API).
//   2. Resolve baseline empty-but-valid config (with the user-supplied
//      project name) and serialise to Config.json.
//   3. Drop Config.json into the dev tenant's bucket so the project's
//      first-ever reconcile already has a published config artifact.
//
// What this DOES NOT do (deferred):
//   - Set up branch protection / CODEOWNERS programmatically.
//   - Register the project in the platform DB (caller's job).
//   - Tenant-credential setup (admin runs `/rpa tenant connect` afterwards).
export class ProjectProvisioningService {
  readonly #github: GithubClient;
  readonly #configOutput: ConfigOutputWriter;

  constructor(deps: ProjectProvisioningDeps) {
    this.#github = deps.github;
    this.#configOutput = deps.configOutput;
  }

  async provision(input: ProvisionInput): Promise<ProvisionResult> {
    const repo: RepoSlug = { owner: input.projectRepoOwner, repo: input.intent.name };

    let generated: { htmlUrl: string };
    try {
      generated = await this.#github.createRepoFromTemplate(input.template, repo, {
        ...(input.intent.description.length > 0 && { description: input.intent.description }),
        // Project repos inherit dev/test/stage/main from the template so
        // the GitHub branch ↔ UiPath tenant mapping (CLAUDE.md) is in
        // place from the first commit. Devs clone, land on `dev`, push,
        // and PR up.
        includeAllBranches: true,
        private: true,
      });
    } catch (err) {
      throw new ProjectProvisioningError(
        `Failed to generate '${repo.owner}/${repo.repo}' from template '${input.template.owner}/${input.template.repo}': ${(err as Error).message}`,
        "project.provision_template_failed",
        { cause: (err as Error).message },
      );
    }

    if (input.devBucketId === undefined || input.devFolderId === undefined) {
      return {
        repo,
        repoUrl: generated.htmlUrl,
        initialConfigBytes: undefined,
        seedConfigSkipped: true,
      };
    }

    const settings = SettingsFile.parse({
      schemaVersion: 1,
      settings: { LogF_BusinessProcessName: input.intent.name },
    });
    const constants = ConstantsFile.parse({ schemaVersion: 1, constants: {} });
    const assets = AssetsFile.parse({ schemaVersion: 1, assets: [] });
    const queues = QueuesFile.parse({ schemaVersion: 1, queues: [] });
    const buckets = BucketsFile.parse({
      schemaVersion: 1,
      buckets: [{ name: "config", description: "Platform-managed config bucket" }],
    });
    const credentials = CredentialsFile.parse({ schemaVersion: 1, credentials: [] });
    const overrides = OverridesFile.parse({ schemaVersion: 1, overrides: {} });

    let writeResult;
    try {
      writeResult = await this.#configOutput.writeToBucket(
        {
          tenant: "dev",
          settings,
          constants,
          assets,
          queues,
          buckets,
          credentials,
          overrides,
        },
        input.pinnedFrameworkVersion,
        { bucketId: input.devBucketId, folderId: input.devFolderId },
      );
    } catch (err) {
      throw new ProjectProvisioningError(
        `Repo '${repo.owner}/${repo.repo}' was created but the initial Config.json upload to the dev bucket failed: ${(err as Error).message}`,
        "project.provision_seed_config_failed",
        { cause: (err as Error).message, repoUrl: generated.htmlUrl },
      );
    }

    return {
      repo,
      repoUrl: generated.htmlUrl,
      initialConfigBytes: writeResult.jsonBytes,
      seedConfigSkipped: false,
    };
  }
}
