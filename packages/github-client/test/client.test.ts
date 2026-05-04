import { describe, expect, it, vi } from "vitest";
import { GithubClient, GithubRequestError } from "../src/index.js";

// We construct an Octokit-shaped stub rather than invoking real network
// calls. The shape only includes the methods our wrapper actually uses.
function makeOctokitStub(impl: Record<string, unknown>): unknown {
  return impl;
}

const REPO = { owner: "compiles-first-try", repo: "demo-bot" };

describe("GithubClient.openPullRequest", () => {
  it("calls pulls.create and maps the response", async () => {
    const create = vi.fn().mockResolvedValue({
      data: {
        number: 42,
        url: "https://api.github.com/repos/o/r/pulls/42",
        html_url: "https://github.com/o/r/pull/42",
        state: "open",
        head: { ref: "feature/x" },
        base: { ref: "main" },
        merged: false,
        merged_at: null,
      },
    });
    const octokit = makeOctokitStub({ pulls: { create } }) as never;
    const client = new GithubClient({ octokit });
    const pr = await client.openPullRequest(REPO, { title: "T", head: "feature/x", base: "main" });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ owner: REPO.owner, repo: REPO.repo, title: "T" }));
    expect(pr.number).toBe(42);
    expect(pr.htmlUrl).toBe("https://github.com/o/r/pull/42");
  });

  it("wraps Octokit errors as GithubRequestError preserving status", async () => {
    const err = Object.assign(new Error("validation failed"), { status: 422 });
    const octokit = makeOctokitStub({
      pulls: { create: vi.fn().mockRejectedValue(err) },
    }) as never;
    const client = new GithubClient({ octokit });
    let caught: unknown;
    try {
      await client.openPullRequest(REPO, { title: "T", head: "h", base: "b" });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(GithubRequestError);
    if (caught instanceof GithubRequestError) {
      expect(caught.status).toBe(422);
      expect(caught.code).toBe("github.request_failed.422");
    }
  });
});

describe("GithubClient.getFileContent", () => {
  it("decodes base64 content into utf-8", async () => {
    const base64 = Buffer.from("hello world", "utf8").toString("base64");
    const getContent = vi.fn().mockResolvedValue({
      data: { type: "file", sha: "abc", content: base64, encoding: "base64" },
    });
    const octokit = makeOctokitStub({ repos: { getContent } }) as never;
    const client = new GithubClient({ octokit });
    const file = await client.getFileContent(REPO, "settings.json");
    expect(file.contentUtf8).toBe("hello world");
    expect(file.sha).toBe("abc");
  });

  it("throws when the path resolves to a directory", async () => {
    const getContent = vi.fn().mockResolvedValue({ data: [] });
    const octokit = makeOctokitStub({ repos: { getContent } }) as never;
    const client = new GithubClient({ octokit });
    await expect(client.getFileContent(REPO, "config")).rejects.toBeInstanceOf(GithubRequestError);
  });
});

describe("GithubClient.listFiles", () => {
  it("filters to file/dir entries and projects the metadata", async () => {
    const getContent = vi.fn().mockResolvedValue({
      data: [
        { path: "config/settings.json", sha: "1", type: "file", size: 32 },
        { path: "config/sub", sha: "2", type: "dir", size: 0 },
        { path: "config/symlink", sha: "3", type: "symlink", size: 0 },
      ],
    });
    const octokit = makeOctokitStub({ repos: { getContent } }) as never;
    const client = new GithubClient({ octokit });
    const entries = await client.listFiles(REPO, "config");
    expect(entries).toHaveLength(2);
    expect(entries[0]?.path).toBe("config/settings.json");
  });
});

describe("GithubClient.getBranchProtection", () => {
  it("returns enabled=true with required reviews when present", async () => {
    const getBranchProtection = vi.fn().mockResolvedValue({
      data: {
        required_pull_request_reviews: { required_approving_review_count: 1, require_code_owner_reviews: true },
        enforce_admins: { enabled: true },
      },
    });
    const octokit = makeOctokitStub({ repos: { getBranchProtection } }) as never;
    const client = new GithubClient({ octokit });
    const summary = await client.getBranchProtection(REPO, "main");
    expect(summary.enabled).toBe(true);
    expect(summary.requiredReviews).toBe(1);
    expect(summary.requireCodeOwnerReviews).toBe(true);
    expect(summary.enforceAdmins).toBe(true);
  });

  it("returns enabled=false on a 404 (no protection configured)", async () => {
    const getBranchProtection = vi.fn().mockRejectedValue(Object.assign(new Error("not found"), { status: 404 }));
    const octokit = makeOctokitStub({ repos: { getBranchProtection } }) as never;
    const client = new GithubClient({ octokit });
    const summary = await client.getBranchProtection(REPO, "feature");
    expect(summary.enabled).toBe(false);
  });
});

describe("GithubClient.commitFileAndOpenPR", () => {
  it("branches from base, writes the file, opens a PR", async () => {
    const getBranch = vi.fn().mockResolvedValue({ data: { commit: { sha: "base-sha" } } });
    const createRef = vi.fn().mockResolvedValue({ data: {} });
    const getContent = vi.fn().mockRejectedValue(Object.assign(new Error("not found"), { status: 404 }));
    const createOrUpdateFileContents = vi.fn().mockResolvedValue({ data: {} });
    const create = vi.fn().mockResolvedValue({
      data: {
        number: 7,
        url: "u",
        html_url: "h",
        state: "open",
        head: { ref: "bot/x" },
        base: { ref: "test" },
        merged: false,
        merged_at: null,
      },
    });

    const octokit = makeOctokitStub({
      repos: { getBranch, getContent, createOrUpdateFileContents },
      git: { createRef },
      pulls: { create },
    }) as never;
    const client = new GithubClient({ octokit });
    const pr = await client.commitFileAndOpenPR(REPO, {
      branchName: "bot/x",
      baseBranch: "test",
      filePath: "config/settings.json",
      fileContent: '{"x":1}',
      commitMessage: "Update settings",
      pullRequestTitle: "Update settings",
    });
    expect(pr.number).toBe(7);
    expect(getBranch).toHaveBeenCalledWith(expect.objectContaining({ branch: "test" }));
    expect(createRef).toHaveBeenCalledWith(expect.objectContaining({ ref: "refs/heads/bot/x", sha: "base-sha" }));
    expect(createOrUpdateFileContents).toHaveBeenCalled();
    const callArg = (createOrUpdateFileContents.mock.calls[0] as [Record<string, unknown>])[0];
    expect(callArg.path).toBe("config/settings.json");
    expect(Buffer.from(String(callArg.content), "base64").toString("utf8")).toBe('{"x":1}');
  });
});

describe("GithubClient construction", () => {
  it("throws when no auth is supplied", () => {
    expect(() => new GithubClient()).toThrow();
  });
});
