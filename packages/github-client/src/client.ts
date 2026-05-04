import { Octokit } from "@octokit/rest";
import { GithubRequestError } from "./errors.js";
import type {
  BranchProtectionSummary,
  FileContent,
  FileEntry,
  PullRequestInput,
  PullRequestRef,
  RepoSlug,
} from "./types.js";

export interface GithubClientOptions {
  // Either supply a pre-built Octokit (recommended for the API server, which
  // wires GitHub App auth via @octokit/auth-app at boot) or a raw token for
  // simpler scenarios.
  readonly octokit?: Octokit;
  readonly token?: string;
}

export interface CommitFileOptions {
  readonly branchName: string;
  readonly baseBranch: string;
  readonly filePath: string;
  readonly fileContent: string;
  readonly commitMessage: string;
  readonly pullRequestTitle: string;
  readonly pullRequestBody?: string;
}

export class GithubClient {
  readonly #octokit: Octokit;

  constructor(options: GithubClientOptions = {}) {
    if (options.octokit !== undefined) {
      this.#octokit = options.octokit;
    } else if (options.token !== undefined) {
      this.#octokit = new Octokit({ auth: options.token });
    } else {
      throw new Error("GithubClient requires either `octokit` or `token`.");
    }
  }

  async openPullRequest(repo: RepoSlug, input: PullRequestInput): Promise<PullRequestRef> {
    const response = await wrapOctokit(() =>
      this.#octokit.pulls.create({
        owner: repo.owner,
        repo: repo.repo,
        title: input.title,
        head: input.head,
        base: input.base,
        ...(input.body !== undefined && { body: input.body }),
        ...(input.draft !== undefined && { draft: input.draft }),
      }),
    );
    return mapPullRequest(response.data);
  }

  async getPullRequest(repo: RepoSlug, number: number): Promise<PullRequestRef> {
    const response = await wrapOctokit(() =>
      this.#octokit.pulls.get({ owner: repo.owner, repo: repo.repo, pull_number: number }),
    );
    return mapPullRequest(response.data);
  }

  async listOpenPullRequests(repo: RepoSlug, base?: string): Promise<readonly PullRequestRef[]> {
    const response = await wrapOctokit(() =>
      this.#octokit.pulls.list({
        owner: repo.owner,
        repo: repo.repo,
        state: "open",
        per_page: 100,
        ...(base !== undefined && { base }),
      }),
    );
    return response.data.map(mapPullRequest);
  }

  async getFileContent(repo: RepoSlug, path: string, ref?: string): Promise<FileContent> {
    const response = await wrapOctokit(() =>
      this.#octokit.repos.getContent({
        owner: repo.owner,
        repo: repo.repo,
        path,
        ...(ref !== undefined && { ref }),
      }),
    );
    if (Array.isArray(response.data) || response.data.type !== "file") {
      throw new GithubRequestError(`Expected a file at '${path}' but got a directory or symlink.`, undefined);
    }
    const data = response.data;
    if (data.content === undefined || data.encoding === undefined) {
      throw new GithubRequestError(`File '${path}' returned without inline content.`, undefined);
    }
    const contentBase64 = data.content.replace(/\n/gu, "");
    return {
      path,
      sha: data.sha,
      contentBase64,
      contentUtf8: Buffer.from(contentBase64, data.encoding as BufferEncoding).toString("utf8"),
    };
  }

  async listFiles(repo: RepoSlug, path: string, ref?: string): Promise<readonly FileEntry[]> {
    const response = await wrapOctokit(() =>
      this.#octokit.repos.getContent({
        owner: repo.owner,
        repo: repo.repo,
        path,
        ...(ref !== undefined && { ref }),
      }),
    );
    if (!Array.isArray(response.data)) {
      throw new GithubRequestError(`Expected a directory at '${path}' but got a single file.`, undefined);
    }
    return response.data
      .filter((entry): entry is typeof entry & { type: "file" | "dir" } =>
        entry.type === "file" || entry.type === "dir",
      )
      .map((entry) => ({
        path: entry.path,
        sha: entry.sha,
        type: entry.type,
        size: entry.size,
      }));
  }

  async getBranchHeadSha(repo: RepoSlug, branch: string): Promise<string> {
    const response = await wrapOctokit(() =>
      this.#octokit.repos.getBranch({ owner: repo.owner, repo: repo.repo, branch }),
    );
    return response.data.commit.sha;
  }

  async createBranch(repo: RepoSlug, newBranch: string, fromSha: string): Promise<void> {
    await wrapOctokit(() =>
      this.#octokit.git.createRef({
        owner: repo.owner,
        repo: repo.repo,
        ref: `refs/heads/${newBranch}`,
        sha: fromSha,
      }),
    );
  }

  async getBranchProtection(repo: RepoSlug, branch: string): Promise<BranchProtectionSummary> {
    try {
      const response = await this.#octokit.repos.getBranchProtection({
        owner: repo.owner,
        repo: repo.repo,
        branch,
      });
      const reviews = response.data.required_pull_request_reviews;
      return {
        branch,
        enabled: true,
        requiredReviews: reviews?.required_approving_review_count,
        requireCodeOwnerReviews: reviews?.require_code_owner_reviews,
        enforceAdmins: response.data.enforce_admins?.enabled,
      };
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 404) {
        return {
          branch,
          enabled: false,
          requiredReviews: undefined,
          requireCodeOwnerReviews: undefined,
          enforceAdmins: undefined,
        };
      }
      throw new GithubRequestError(
        `Failed to read branch protection for '${branch}': ${(err as Error).message}`,
        status,
        { cause: err },
      );
    }
  }

  // The "/rpa new" flow: generate a brand-new repo from the configured
  // template repo. UiPath REFramework template is the typical starting
  // point; the template is configurable per-deployment via the API's env.
  async createRepoFromTemplate(
    template: RepoSlug,
    target: RepoSlug,
    options: {
      readonly description?: string;
      readonly includeAllBranches?: boolean;
      readonly private?: boolean;
    } = {},
  ): Promise<{ readonly htmlUrl: string; readonly cloneUrl: string }> {
    const response = await wrapOctokit(() =>
      this.#octokit.repos.createUsingTemplate({
        template_owner: template.owner,
        template_repo: template.repo,
        owner: target.owner,
        name: target.repo,
        ...(options.description !== undefined && { description: options.description }),
        ...(options.includeAllBranches !== undefined && { include_all_branches: options.includeAllBranches }),
        ...(options.private !== undefined && { private: options.private }),
      }),
    );
    return {
      htmlUrl: response.data.html_url,
      cloneUrl: response.data.clone_url,
    };
  }

  // The "/rpa config set" flow: take a single-file change, branch from base,
  // commit it, open a PR. v1 keeps it to one file at a time — multi-file
  // commits remain a v2 concern.
  async commitFileAndOpenPR(repo: RepoSlug, options: CommitFileOptions): Promise<PullRequestRef> {
    const baseSha = await this.getBranchHeadSha(repo, options.baseBranch);
    await this.createBranch(repo, options.branchName, baseSha);

    let existingSha: string | undefined;
    try {
      const existing = await this.getFileContent(repo, options.filePath, options.branchName);
      existingSha = existing.sha;
    } catch (err) {
      if ((err as { status?: number }).status !== 404) {
        // Treat anything other than "file not found" as fatal.
        throw err;
      }
    }

    await wrapOctokit(() =>
      this.#octokit.repos.createOrUpdateFileContents({
        owner: repo.owner,
        repo: repo.repo,
        path: options.filePath,
        message: options.commitMessage,
        content: Buffer.from(options.fileContent, "utf8").toString("base64"),
        branch: options.branchName,
        ...(existingSha !== undefined && { sha: existingSha }),
      }),
    );

    return this.openPullRequest(repo, {
      title: options.pullRequestTitle,
      head: options.branchName,
      base: options.baseBranch,
      ...(options.pullRequestBody !== undefined && { body: options.pullRequestBody }),
    });
  }
}

async function wrapOctokit<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (err) {
    const status = (err as { status?: number }).status;
    const message = (err as Error).message ?? "Unknown GitHub error";
    throw new GithubRequestError(message, status, { cause: err });
  }
}

function mapPullRequest(data: {
  number: number;
  url: string;
  html_url: string;
  state: string;
  head: { ref: string };
  base: { ref: string };
  merged?: boolean | null;
  merged_at?: string | null;
}): PullRequestRef {
  return {
    number: data.number,
    url: data.url,
    htmlUrl: data.html_url,
    state: data.state,
    head: data.head.ref,
    base: data.base.ref,
    merged: data.merged === true || data.merged_at !== null && data.merged_at !== undefined,
  };
}
