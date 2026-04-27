import type {
  CommentOnPullRequestParams,
  CommitFileParams,
  CommitInfo,
  FileLookupResult,
  GitHubApi,
  OpenPullRequestParams,
  PullRequestSummary,
  RepoRef,
} from "../src/index.js";

export interface FakeFileEntry {
  readonly content: string;
  readonly sha: string;
}

export class FakeGitHubApi implements GitHubApi {
  public readonly files: Map<string, FakeFileEntry> = new Map();
  public readonly commits: CommitFileParams[] = [];
  public readonly branches: { name: string; sha: string }[] = [];
  public readonly pullsOpened: OpenPullRequestParams[] = [];
  public readonly comments: CommentOnPullRequestParams[] = [];
  private nextPrNumber = 1;
  private nextCommentId = 1000;
  private readonly pulls: Map<number, PullRequestSummary> = new Map();

  private fileKey(repo: RepoRef, ref: string, path: string): string {
    return `${repo.owner}/${repo.repo}@${ref}:${path}`;
  }

  seedFile(repo: RepoRef, ref: string, path: string, content: string, sha = "deadbeef"): void {
    this.files.set(this.fileKey(repo, ref, path), { content, sha });
  }

  async getFileContents(repo: RepoRef, path: string, ref: string): Promise<FileLookupResult> {
    const entry = this.files.get(this.fileKey(repo, ref, path));
    if (entry === undefined) return { path, status: "missing" };
    return { path, content: entry.content, sha: entry.sha };
  }

  async getMultipleFiles(
    repo: RepoRef,
    paths: readonly string[],
    ref: string,
  ): Promise<readonly FileLookupResult[]> {
    return Promise.all(paths.map((p) => this.getFileContents(repo, p, ref)));
  }

  async commitFile(repo: RepoRef, params: CommitFileParams): Promise<{ sha: string }> {
    this.commits.push(params);
    const sha = `sha-${this.commits.length}`;
    this.files.set(this.fileKey(repo, params.branch, params.path), {
      content: params.content,
      sha,
    });
    return { sha };
  }

  async createBranch(_repo: RepoRef, branch: string, fromSha: string): Promise<void> {
    this.branches.push({ name: branch, sha: fromSha });
  }

  async openPullRequest(
    _repo: RepoRef,
    params: OpenPullRequestParams,
  ): Promise<PullRequestSummary> {
    this.pullsOpened.push(params);
    const number = this.nextPrNumber++;
    const summary: PullRequestSummary = {
      number,
      state: "open",
      merged: false,
      headRef: params.head,
      baseRef: params.base,
      title: params.title,
      url: `https://github.test/pr/${number}`,
      mergeableState: "clean",
    };
    this.pulls.set(number, summary);
    return summary;
  }

  async getPullRequest(_repo: RepoRef, prNumber: number): Promise<PullRequestSummary> {
    const pr = this.pulls.get(prNumber);
    if (pr === undefined) {
      throw new Error(`PR #${prNumber} not found in fake`);
    }
    return pr;
  }

  async listPullRequests(
    _repo: RepoRef,
    options: { state?: "open" | "closed" | "all"; base?: string } = {},
  ): Promise<readonly PullRequestSummary[]> {
    const all = Array.from(this.pulls.values());
    return all.filter((pr) => {
      if (options.state !== undefined && options.state !== "all" && pr.state !== options.state) {
        return false;
      }
      if (options.base !== undefined && pr.baseRef !== options.base) return false;
      return true;
    });
  }

  async commentOnPullRequest(
    _repo: RepoRef,
    params: CommentOnPullRequestParams,
  ): Promise<{ commentId: number }> {
    this.comments.push(params);
    return { commentId: this.nextCommentId++ };
  }

  async getCommit(_repo: RepoRef, sha: string): Promise<CommitInfo> {
    return {
      sha,
      message: `commit ${sha}`,
      authorLogin: "tester",
      authorEmail: "tester@example",
      committedAt: "2026-01-01T00:00:00Z",
    };
  }

  async getDefaultBranchHead(_repo: RepoRef): Promise<{ branch: string; sha: string }> {
    return { branch: "main", sha: "main-sha" };
  }
}
