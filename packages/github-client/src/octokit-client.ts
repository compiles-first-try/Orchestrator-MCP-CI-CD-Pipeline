import { Octokit } from "@octokit/rest";
import { GitHubApiError, GitHubTransportError } from "./errors.js";
import type {
  CommentOnPullRequestParams,
  CommitFileParams,
  CommitInfo,
  FileLookupResult,
  GitHubApi,
  OpenPullRequestParams,
  PullRequestSummary,
  RepoRef,
} from "./types.js";

export interface OctokitGitHubApiConfig {
  readonly authToken: string;
  readonly baseUrl?: string;
  readonly userAgent?: string;
  readonly octokit?: Octokit;
}

export class OctokitGitHubApi implements GitHubApi {
  private readonly octokit: Octokit;

  constructor(config: OctokitGitHubApiConfig) {
    this.octokit =
      config.octokit ??
      new Octokit({
        auth: config.authToken,
        ...(config.baseUrl !== undefined ? { baseUrl: config.baseUrl } : {}),
        ...(config.userAgent !== undefined ? { userAgent: config.userAgent } : {}),
      });
  }

  async getFileContents(repo: RepoRef, path: string, ref: string): Promise<FileLookupResult> {
    try {
      const response = await this.octokit.rest.repos.getContent({
        owner: repo.owner,
        repo: repo.repo,
        path,
        ref,
      });
      const data = response.data;
      if (Array.isArray(data) || data.type !== "file" || typeof data.content !== "string") {
        return { path, status: "missing" };
      }
      const decoded = Buffer.from(data.content, data.encoding as BufferEncoding).toString("utf8");
      return { path, content: decoded, sha: data.sha };
    } catch (err) {
      const status = pickStatus(err);
      if (status === 404) return { path, status: "missing" };
      throw mapError(err, `getFileContents ${path}@${ref}`);
    }
  }

  async getMultipleFiles(
    repo: RepoRef,
    paths: readonly string[],
    ref: string,
  ): Promise<readonly FileLookupResult[]> {
    return Promise.all(paths.map((p) => this.getFileContents(repo, p, ref)));
  }

  async commitFile(repo: RepoRef, params: CommitFileParams): Promise<{ sha: string }> {
    try {
      const response = await this.octokit.rest.repos.createOrUpdateFileContents({
        owner: repo.owner,
        repo: repo.repo,
        path: params.path,
        message: params.message,
        content: Buffer.from(params.content, "utf8").toString("base64"),
        branch: params.branch,
        ...(params.sha !== undefined ? { sha: params.sha } : {}),
        ...(params.committer !== undefined ? { committer: params.committer } : {}),
      });
      const sha = response.data.commit.sha ?? "";
      return { sha };
    } catch (err) {
      throw mapError(err, `commitFile ${params.path}@${params.branch}`);
    }
  }

  async createBranch(repo: RepoRef, branch: string, fromSha: string): Promise<void> {
    try {
      await this.octokit.rest.git.createRef({
        owner: repo.owner,
        repo: repo.repo,
        ref: `refs/heads/${branch}`,
        sha: fromSha,
      });
    } catch (err) {
      throw mapError(err, `createBranch ${branch}`);
    }
  }

  async openPullRequest(repo: RepoRef, params: OpenPullRequestParams): Promise<PullRequestSummary> {
    try {
      const response = await this.octokit.rest.pulls.create({
        owner: repo.owner,
        repo: repo.repo,
        head: params.head,
        base: params.base,
        title: params.title,
        body: params.body,
        ...(params.draft !== undefined ? { draft: params.draft } : {}),
      });
      return summarizePr(response.data);
    } catch (err) {
      throw mapError(err, `openPullRequest ${params.head}->${params.base}`);
    }
  }

  async getPullRequest(repo: RepoRef, prNumber: number): Promise<PullRequestSummary> {
    try {
      const response = await this.octokit.rest.pulls.get({
        owner: repo.owner,
        repo: repo.repo,
        pull_number: prNumber,
      });
      return summarizePr(response.data);
    } catch (err) {
      throw mapError(err, `getPullRequest #${prNumber}`);
    }
  }

  async listPullRequests(
    repo: RepoRef,
    options: { state?: "open" | "closed" | "all"; base?: string } = {},
  ): Promise<readonly PullRequestSummary[]> {
    try {
      const response = await this.octokit.rest.pulls.list({
        owner: repo.owner,
        repo: repo.repo,
        state: options.state ?? "open",
        ...(options.base !== undefined ? { base: options.base } : {}),
      });
      return response.data.map(summarizePr);
    } catch (err) {
      throw mapError(err, `listPullRequests`);
    }
  }

  async commentOnPullRequest(
    repo: RepoRef,
    params: CommentOnPullRequestParams,
  ): Promise<{ commentId: number }> {
    try {
      const response = await this.octokit.rest.issues.createComment({
        owner: repo.owner,
        repo: repo.repo,
        issue_number: params.prNumber,
        body: params.body,
      });
      return { commentId: response.data.id };
    } catch (err) {
      throw mapError(err, `commentOnPullRequest #${params.prNumber}`);
    }
  }

  async getCommit(repo: RepoRef, sha: string): Promise<CommitInfo> {
    try {
      const response = await this.octokit.rest.repos.getCommit({
        owner: repo.owner,
        repo: repo.repo,
        ref: sha,
      });
      const commit = response.data.commit;
      return {
        sha: response.data.sha,
        message: commit.message,
        authorLogin: response.data.author?.login,
        authorEmail: commit.author?.email,
        committedAt: commit.author?.date ?? "",
      };
    } catch (err) {
      throw mapError(err, `getCommit ${sha}`);
    }
  }

  async getDefaultBranchHead(repo: RepoRef): Promise<{ branch: string; sha: string }> {
    try {
      const repoInfo = await this.octokit.rest.repos.get({
        owner: repo.owner,
        repo: repo.repo,
      });
      const branch = repoInfo.data.default_branch;
      const ref = await this.octokit.rest.git.getRef({
        owner: repo.owner,
        repo: repo.repo,
        ref: `heads/${branch}`,
      });
      return { branch, sha: ref.data.object.sha };
    } catch (err) {
      throw mapError(err, "getDefaultBranchHead");
    }
  }
}

function pickStatus(err: unknown): number | undefined {
  if (err === null || typeof err !== "object") return undefined;
  const status = (err as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

function mapError(err: unknown, context: string): Error {
  const status = pickStatus(err);
  if (status !== undefined) {
    const message =
      err !== null && typeof err === "object" && "message" in err
        ? String((err as { message: unknown }).message)
        : "unknown";
    return new GitHubApiError(status, `${context}: ${message}`, { cause: err });
  }
  return new GitHubTransportError(context, { cause: err });
}

function summarizePr(pr: {
  number: number;
  state: string;
  merged?: boolean | null;
  merged_at?: string | null;
  head: { ref: string };
  base: { ref: string };
  title: string;
  html_url: string;
  mergeable_state?: string | null;
}): PullRequestSummary {
  const merged = pr.merged === true || (pr.merged_at !== undefined && pr.merged_at !== null);
  return {
    number: pr.number,
    state: pr.state === "open" ? "open" : "closed",
    merged,
    headRef: pr.head.ref,
    baseRef: pr.base.ref,
    title: pr.title,
    url: pr.html_url,
    mergeableState: pr.mergeable_state ?? undefined,
  };
}
