export interface RepoSlug {
  readonly owner: string;
  readonly repo: string;
}

export interface PullRequestInput {
  readonly title: string;
  readonly body?: string;
  // Branch with new changes.
  readonly head: string;
  // Branch to merge into (e.g. 'test', 'main').
  readonly base: string;
  readonly draft?: boolean;
}

export interface PullRequestRef {
  readonly number: number;
  readonly url: string;
  readonly htmlUrl: string;
  readonly state: string;
  readonly head: string;
  readonly base: string;
  readonly merged: boolean;
}

export interface FileEntry {
  readonly path: string;
  readonly sha: string;
  readonly type: "file" | "dir";
  readonly size: number | undefined;
}

export interface FileContent {
  readonly path: string;
  readonly sha: string;
  readonly contentBase64: string;
  readonly contentUtf8: string;
}

export interface BranchProtectionSummary {
  readonly branch: string;
  readonly enabled: boolean;
  readonly requiredReviews: number | undefined;
  readonly requireCodeOwnerReviews: boolean | undefined;
  readonly enforceAdmins: boolean | undefined;
}
