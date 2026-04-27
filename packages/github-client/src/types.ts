export interface RepoRef {
  readonly owner: string;
  readonly repo: string;
}

export interface FileContents {
  readonly path: string;
  readonly content: string;
  readonly sha: string;
}

export interface FileMissing {
  readonly path: string;
  readonly status: "missing";
}

export type FileLookupResult = FileContents | FileMissing;

export interface CommitFileParams {
  readonly path: string;
  readonly content: string;
  readonly message: string;
  readonly branch: string;
  readonly committer?: { name: string; email: string };
  readonly sha?: string;
}

export interface PullRequestSummary {
  readonly number: number;
  readonly state: "open" | "closed";
  readonly merged: boolean;
  readonly headRef: string;
  readonly baseRef: string;
  readonly title: string;
  readonly url: string;
  readonly mergeableState: string | undefined;
}

export interface OpenPullRequestParams {
  readonly head: string;
  readonly base: string;
  readonly title: string;
  readonly body: string;
  readonly draft?: boolean;
}

export interface CommentOnPullRequestParams {
  readonly prNumber: number;
  readonly body: string;
}

export interface CommitInfo {
  readonly sha: string;
  readonly message: string;
  readonly authorLogin: string | undefined;
  readonly authorEmail: string | undefined;
  readonly committedAt: string;
}

export interface GitHubApi {
  getFileContents(repo: RepoRef, path: string, ref: string): Promise<FileLookupResult>;
  getMultipleFiles(
    repo: RepoRef,
    paths: readonly string[],
    ref: string,
  ): Promise<readonly FileLookupResult[]>;
  commitFile(repo: RepoRef, params: CommitFileParams): Promise<{ sha: string }>;
  createBranch(repo: RepoRef, branch: string, fromSha: string): Promise<void>;
  openPullRequest(repo: RepoRef, params: OpenPullRequestParams): Promise<PullRequestSummary>;
  getPullRequest(repo: RepoRef, prNumber: number): Promise<PullRequestSummary>;
  listPullRequests(
    repo: RepoRef,
    options?: { state?: "open" | "closed" | "all"; base?: string },
  ): Promise<readonly PullRequestSummary[]>;
  commentOnPullRequest(
    repo: RepoRef,
    params: CommentOnPullRequestParams,
  ): Promise<{ commentId: number }>;
  getCommit(repo: RepoRef, sha: string): Promise<CommitInfo>;
  getDefaultBranchHead(repo: RepoRef): Promise<{ branch: string; sha: string }>;
}
