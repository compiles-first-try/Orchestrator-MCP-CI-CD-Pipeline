import { describe, expect, it } from "vitest";
import { GitHubApiError, OctokitGitHubApi } from "../src/index.js";
import type { Octokit } from "@octokit/rest";

interface OctokitFake {
  readonly rest: {
    readonly repos: {
      getContent: (params: Record<string, unknown>) => Promise<{ data: unknown }>;
      createOrUpdateFileContents: (
        params: Record<string, unknown>,
      ) => Promise<{ data: { commit: { sha: string } } }>;
      get: (params: Record<string, unknown>) => Promise<{ data: { default_branch: string } }>;
      getCommit: (params: Record<string, unknown>) => Promise<{
        data: {
          sha: string;
          author: { login: string } | null;
          commit: { message: string; author: { email: string; date: string } | null };
        };
      }>;
    };
    readonly git: {
      createRef: (params: Record<string, unknown>) => Promise<{ data: unknown }>;
      getRef: (params: Record<string, unknown>) => Promise<{ data: { object: { sha: string } } }>;
    };
    readonly pulls: {
      create: (params: Record<string, unknown>) => Promise<{ data: PrPayload }>;
      get: (params: Record<string, unknown>) => Promise<{ data: PrPayload }>;
      list: (params: Record<string, unknown>) => Promise<{ data: PrPayload[] }>;
    };
    readonly issues: {
      createComment: (params: Record<string, unknown>) => Promise<{ data: { id: number } }>;
    };
  };
}

interface PrPayload {
  number: number;
  state: string;
  merged?: boolean | null;
  merged_at?: string | null;
  head: { ref: string };
  base: { ref: string };
  title: string;
  html_url: string;
  mergeable_state?: string | null;
}

function makeOctokitFake(overrides: Partial<OctokitFake["rest"]> = {}): OctokitFake {
  const stub: OctokitFake["rest"] = {
    repos: {
      getContent: async () => ({
        data: { type: "file", encoding: "base64", content: "", sha: "" },
      }),
      createOrUpdateFileContents: async () => ({ data: { commit: { sha: "" } } }),
      get: async () => ({ data: { default_branch: "main" } }),
      getCommit: async () => ({
        data: {
          sha: "",
          author: null,
          commit: { message: "", author: null },
        },
      }),
      ...overrides.repos,
    },
    git: {
      createRef: async () => ({ data: {} }),
      getRef: async () => ({ data: { object: { sha: "" } } }),
      ...overrides.git,
    },
    pulls: {
      create: async () => ({
        data: {
          number: 0,
          state: "open",
          head: { ref: "" },
          base: { ref: "" },
          title: "",
          html_url: "",
        },
      }),
      get: async () => ({
        data: {
          number: 0,
          state: "open",
          head: { ref: "" },
          base: { ref: "" },
          title: "",
          html_url: "",
        },
      }),
      list: async () => ({ data: [] }),
      ...overrides.pulls,
    },
    issues: {
      createComment: async () => ({ data: { id: 0 } }),
      ...overrides.issues,
    },
  };
  return { rest: stub };
}

const repo = { owner: "acme", repo: "bot-x" };

describe("OctokitGitHubApi", () => {
  it("getFileContents decodes base64 content for file responses", async () => {
    const fake = makeOctokitFake({
      repos: {
        getContent: async () => ({
          data: {
            type: "file",
            encoding: "base64",
            content: Buffer.from('{"k":1}', "utf8").toString("base64"),
            sha: "abc",
          },
        }),
        createOrUpdateFileContents: async () => ({ data: { commit: { sha: "" } } }),
        get: async () => ({ data: { default_branch: "main" } }),
        getCommit: async () => ({
          data: { sha: "", author: null, commit: { message: "", author: null } },
        }),
      },
    });
    const api = new OctokitGitHubApi({
      authToken: "x",
      octokit: fake as unknown as Octokit,
    });
    const result = await api.getFileContents(repo, "settings.json", "dev");
    if ("content" in result) {
      expect(result.content).toBe('{"k":1}');
      expect(result.sha).toBe("abc");
    } else {
      expect.fail("expected content");
    }
  });

  it("getFileContents returns missing on 404", async () => {
    const fake = makeOctokitFake({
      repos: {
        getContent: async () => {
          const err = Object.assign(new Error("not found"), { status: 404 });
          throw err;
        },
        createOrUpdateFileContents: async () => ({ data: { commit: { sha: "" } } }),
        get: async () => ({ data: { default_branch: "main" } }),
        getCommit: async () => ({
          data: { sha: "", author: null, commit: { message: "", author: null } },
        }),
      },
    });
    const api = new OctokitGitHubApi({
      authToken: "x",
      octokit: fake as unknown as Octokit,
    });
    const result = await api.getFileContents(repo, "missing.json", "dev");
    expect("status" in result && result.status === "missing").toBe(true);
  });

  it("getFileContents maps non-404 status errors to GitHubApiError", async () => {
    const fake = makeOctokitFake({
      repos: {
        getContent: async () => {
          throw Object.assign(new Error("forbidden"), { status: 403 });
        },
        createOrUpdateFileContents: async () => ({ data: { commit: { sha: "" } } }),
        get: async () => ({ data: { default_branch: "main" } }),
        getCommit: async () => ({
          data: { sha: "", author: null, commit: { message: "", author: null } },
        }),
      },
    });
    const api = new OctokitGitHubApi({
      authToken: "x",
      octokit: fake as unknown as Octokit,
    });
    await expect(api.getFileContents(repo, "x.json", "dev")).rejects.toBeInstanceOf(GitHubApiError);
  });

  it("commitFile base64-encodes content before sending", async () => {
    let received: Record<string, unknown> | undefined;
    const fake = makeOctokitFake({
      repos: {
        getContent: async () => ({ data: { type: "dir" } }),
        createOrUpdateFileContents: async (params) => {
          received = params;
          return { data: { commit: { sha: "commit-1" } } };
        },
        get: async () => ({ data: { default_branch: "main" } }),
        getCommit: async () => ({
          data: { sha: "", author: null, commit: { message: "", author: null } },
        }),
      },
    });
    const api = new OctokitGitHubApi({
      authToken: "x",
      octokit: fake as unknown as Octokit,
    });
    const result = await api.commitFile(repo, {
      path: "x.json",
      content: "hello",
      message: "set",
      branch: "dev",
    });
    expect(result.sha).toBe("commit-1");
    expect(received?.["content"]).toBe(Buffer.from("hello", "utf8").toString("base64"));
  });

  it("openPullRequest summarizes the PR response", async () => {
    const fake = makeOctokitFake({
      pulls: {
        create: async () => ({
          data: {
            number: 7,
            state: "open",
            merged: false,
            head: { ref: "feat" },
            base: { ref: "main" },
            title: "Add x",
            html_url: "https://github.test/pr/7",
            mergeable_state: "clean",
          },
        }),
        get: async () => ({
          data: {
            number: 0,
            state: "open",
            head: { ref: "" },
            base: { ref: "" },
            title: "",
            html_url: "",
          },
        }),
        list: async () => ({ data: [] }),
      },
    });
    const api = new OctokitGitHubApi({
      authToken: "x",
      octokit: fake as unknown as Octokit,
    });
    const result = await api.openPullRequest(repo, {
      head: "feat",
      base: "main",
      title: "Add x",
      body: "",
    });
    expect(result.number).toBe(7);
    expect(result.merged).toBe(false);
    expect(result.url).toBe("https://github.test/pr/7");
  });
});
