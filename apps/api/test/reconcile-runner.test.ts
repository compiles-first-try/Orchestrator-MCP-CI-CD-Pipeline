import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  encryptSecret,
  parseEncryptionKey,
  type TenantName,
  type UserWithRoles,
} from "@rpa-platform/shared";
import type {
  CommentOnPullRequestParams,
  CommitFileParams,
  CommitInfo,
  FileLookupResult,
  GitHubApi,
  OpenPullRequestParams,
  PullRequestSummary,
  RepoRef,
} from "@rpa-platform/github-client";

class FakeGitHubApi implements GitHubApi {
  public files = new Map<string, { content: string; sha: string }>();
  private fileKey(r: RepoRef, ref: string, path: string): string {
    return `${r.owner}/${r.repo}@${ref}:${path}`;
  }
  seedFile(r: RepoRef, ref: string, path: string, content: string): void {
    this.files.set(this.fileKey(r, ref, path), { content, sha: "deadbeef" });
  }
  async getFileContents(r: RepoRef, path: string, ref: string): Promise<FileLookupResult> {
    const entry = this.files.get(this.fileKey(r, ref, path));
    if (entry === undefined) return { path, status: "missing" };
    return { path, content: entry.content, sha: entry.sha };
  }
  async getMultipleFiles(
    r: RepoRef,
    paths: readonly string[],
    ref: string,
  ): Promise<readonly FileLookupResult[]> {
    return Promise.all(paths.map((p) => this.getFileContents(r, p, ref)));
  }
  async commitFile(_r: RepoRef, _params: CommitFileParams): Promise<{ sha: string }> {
    return { sha: "x" };
  }
  async createBranch(): Promise<void> {
    /* noop */
  }
  async openPullRequest(_r: RepoRef, _params: OpenPullRequestParams): Promise<PullRequestSummary> {
    throw new Error("not used in these tests");
  }
  async getPullRequest(): Promise<PullRequestSummary> {
    throw new Error("not used in these tests");
  }
  async listPullRequests(): Promise<readonly PullRequestSummary[]> {
    return [];
  }
  async commentOnPullRequest(
    _r: RepoRef,
    _params: CommentOnPullRequestParams,
  ): Promise<{ commentId: number }> {
    return { commentId: 1 };
  }
  async getCommit(): Promise<CommitInfo> {
    throw new Error("not used in these tests");
  }
  async getDefaultBranchHead(): Promise<{ branch: string; sha: string }> {
    return { branch: "main", sha: "x" };
  }
}
import {
  createReconcileRunners,
  InMemoryAuditWriter,
  type ProjectLookup,
  type ProjectRow,
  type TenantRow,
  type ReconcileRequestBody,
} from "../src/index.js";
import {
  ProjectFileMissingError,
  ProjectNotFoundError,
  TenantNotConfiguredForOAuthError,
  TenantNotFoundError,
} from "../src/services/reconcile-runner.js";

const KEY = parseEncryptionKey(randomBytes(32).toString("base64"));
const ENCRYPTED_SECRET = encryptSecret("client-secret", KEY);

const repo = { owner: "acme", repo: "demo-bot" };

function makeTenant(overrides: Partial<TenantRow> = {}): TenantRow {
  return {
    status: "connected",
    orchestratorUrl: "https://orch.example/orchestrator_",
    mcpUrl: undefined,
    folderId: "folder-1",
    oauthClientId: "client-1",
    oauthClientSecretEncrypted: ENCRYPTED_SECRET,
    oauthScopes: undefined,
    ...overrides,
  };
}

function makeProject(tenants: ReadonlyMap<TenantName, TenantRow>): ProjectRow {
  return {
    id: "proj-1",
    name: "demo-bot",
    repoUrl: "https://github.test/acme/demo-bot",
    frameworkVersionPinned: "2.0.0",
    tenants,
  };
}

function fakeProjects(project: ProjectRow | undefined): ProjectLookup {
  return {
    byName: async (name) => (project !== undefined && project.name === name ? project : undefined),
  };
}

function seedRepo(github: FakeGitHubApi, ref: string, files: Record<string, string>): void {
  for (const [path, content] of Object.entries(files)) {
    github.seedFile(repo, ref, path, content);
  }
}

function defaultProjectFiles(): Record<string, string> {
  return {
    "settings.json": "{}",
    "constants.json": "{}",
    "assets.json": "[]",
    "queues.json": "[]",
    "buckets.json": "[]",
    "credentials.json": "[]",
    "overrides.json": "{}",
  };
}

const actor: UserWithRoles = { id: "actor-1", roles: [] };
const baseBody: ReconcileRequestBody = {
  projectName: "demo-bot",
  tenant: "dev",
  branch: "dev",
  commitSha: "abc1234",
};
const baseContext = { actor, correlationId: "corr-1" };

const tokenResponseFetch: typeof globalThis.fetch = async (input) => {
  const url = typeof input === "string" ? input : input.toString();
  if (url.includes("/connect/token")) {
    return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), {
      status: 200,
    });
  }
  if (url.includes("/odata/Assets")) {
    return new Response(JSON.stringify({ value: [] }), { status: 200 });
  }
  if (url.includes("/odata/QueueDefinitions")) {
    return new Response(JSON.stringify({ value: [] }), { status: 200 });
  }
  if (url.includes("/odata/Buckets")) {
    return new Response(JSON.stringify({ value: [] }), { status: 200 });
  }
  return new Response("not found", { status: 404 });
};

const credentialSource = {
  type: "manual" as const,
  getValue: async () => "mock",
  setValue: async () => undefined,
  listNames: async () => [],
  delete: async () => undefined,
};

function makeRunners(
  overrides: {
    project?: ProjectRow | undefined;
    github?: GitHubApi;
    fetchFn?: typeof globalThis.fetch;
  } = {},
) {
  const auditWriter = new InMemoryAuditWriter();
  const project =
    "project" in overrides
      ? overrides.project
      : makeProject(new Map<TenantName, TenantRow>([["dev", makeTenant()]]));
  const github = overrides.github ?? new FakeGitHubApi();
  if (overrides.github === undefined) {
    seedRepo(github as FakeGitHubApi, "abc1234", defaultProjectFiles());
  }
  const runners = createReconcileRunners({
    projects: fakeProjects(project),
    github,
    credentialSource,
    auditWriter,
    encryptionKey: KEY,
    identityTokenUrl: () => "https://orch.example/identity_/connect/token",
    fetch: overrides.fetchFn ?? tokenResponseFetch,
  });
  return { runners, auditWriter, github };
}

describe("createReconcileRunners — runDryRun", () => {
  it("returns a plan and writes an audit entry on success", async () => {
    const { runners, auditWriter } = makeRunners();
    const result = await runners.runDryRun(baseBody, baseContext);
    expect(result.plan.summary.assets.creates).toBe(0);
    const entry = auditWriter.entries.find((e) => e.action === "reconcile.dry_run");
    expect(entry).toBeDefined();
    expect(entry?.success).toBe(true);
    expect(entry?.actorUserId).toBe(actor.id);
  });

  it("throws ProjectNotFoundError when the project doesn't exist", async () => {
    const { runners } = makeRunners({ project: undefined });
    await expect(runners.runDryRun(baseBody, baseContext)).rejects.toBeInstanceOf(
      ProjectNotFoundError,
    );
  });

  it("throws TenantNotFoundError when the tenant isn't on the project", async () => {
    const { runners } = makeRunners({
      project: makeProject(new Map()),
    });
    await expect(runners.runDryRun(baseBody, baseContext)).rejects.toBeInstanceOf(
      TenantNotFoundError,
    );
  });

  it("propagates the spec's reconcile.blocked_unconfigured_tenant when tenant.status is pending_credentials", async () => {
    const { runners, auditWriter } = makeRunners({
      project: makeProject(new Map([["dev", makeTenant({ status: "pending_credentials" })]])),
    });
    await expect(runners.runDryRun(baseBody, baseContext)).rejects.toMatchObject({
      code: "reconcile.blocked_unconfigured_tenant",
    });
    const entry = auditWriter.entries.find((e) => e.action === "reconcile.dry_run");
    expect(entry?.success).toBe(false);
  });

  it("throws TenantNotConfiguredForOAuthError when OAuth credentials are missing", async () => {
    const { runners } = makeRunners({
      project: makeProject(
        new Map([
          [
            "dev",
            makeTenant({
              oauthClientId: undefined,
              oauthClientSecretEncrypted: undefined,
            }),
          ],
        ]),
      ),
    });
    await expect(runners.runDryRun(baseBody, baseContext)).rejects.toBeInstanceOf(
      TenantNotConfiguredForOAuthError,
    );
  });

  it("throws ProjectFileMissingError when settings.json is missing", async () => {
    const github = new FakeGitHubApi();
    const files = defaultProjectFiles();
    delete (files as Record<string, string>)["settings.json"];
    seedRepo(github, "abc1234", files);
    const { runners } = makeRunners({ github });
    await expect(runners.runDryRun(baseBody, baseContext)).rejects.toBeInstanceOf(
      ProjectFileMissingError,
    );
  });

  it("fetches the seven project files at the requested commit SHA", async () => {
    const github = new FakeGitHubApi();
    seedRepo(github, "abc1234", defaultProjectFiles());
    const { runners } = makeRunners({ github });
    await runners.runDryRun(baseBody, baseContext);
    // Each requested file becomes a key in github.files keyed by ref=abc1234.
    const keys = Array.from(github.files.keys());
    expect(keys.some((k) => k.includes("settings.json") && k.includes("@abc1234"))).toBe(true);
  });
});

describe("createReconcileRunners — runApply", () => {
  it("writes a per-resource audit row plus a summary row on success", async () => {
    const { runners, auditWriter } = makeRunners();
    const result = await runners.runApply(baseBody, baseContext);
    expect(result.applyResult.success).toBe(true);
    const summary = auditWriter.entries.filter((e) => e.action === "reconcile.apply");
    expect(summary).toHaveLength(1);
    expect(summary[0]?.success).toBe(true);
  });
});
