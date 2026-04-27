import { describe, expect, it } from "vitest";
import { FakeGitHubApi } from "./fake-api.js";

const repo = { owner: "acme", repo: "bot-x" };

describe("FakeGitHubApi (sanity for the test fake itself)", () => {
  it("returns missing for unseeded files", async () => {
    const api = new FakeGitHubApi();
    const result = await api.getFileContents(repo, "settings.json", "dev");
    expect(result.path).toBe("settings.json");
    if ("status" in result) {
      expect(result.status).toBe("missing");
    } else {
      expect.fail("expected missing");
    }
  });

  it("returns content for seeded files at the requested ref", async () => {
    const api = new FakeGitHubApi();
    api.seedFile(repo, "dev", "settings.json", "{}");
    const result = await api.getFileContents(repo, "settings.json", "dev");
    if ("content" in result) {
      expect(result.content).toBe("{}");
      expect(result.sha).toBe("deadbeef");
    } else {
      expect.fail("expected content");
    }
  });

  it("getMultipleFiles returns one entry per requested path", async () => {
    const api = new FakeGitHubApi();
    api.seedFile(repo, "dev", "a.json", "1");
    api.seedFile(repo, "dev", "b.json", "2");
    const result = await api.getMultipleFiles(repo, ["a.json", "b.json", "c.json"], "dev");
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.path)).toEqual(["a.json", "b.json", "c.json"]);
  });

  it("commitFile records the commit and updates the file at the branch ref", async () => {
    const api = new FakeGitHubApi();
    const result = await api.commitFile(repo, {
      path: "x.json",
      content: '{"k":1}',
      message: "set x",
      branch: "dev",
    });
    expect(result.sha).toBe("sha-1");
    expect(api.commits).toHaveLength(1);
    const lookup = await api.getFileContents(repo, "x.json", "dev");
    if ("content" in lookup) expect(lookup.content).toBe('{"k":1}');
    else expect.fail("expected content");
  });

  it("openPullRequest assigns sequential numbers and records params", async () => {
    const api = new FakeGitHubApi();
    const a = await api.openPullRequest(repo, {
      head: "feat-a",
      base: "main",
      title: "A",
      body: "",
    });
    const b = await api.openPullRequest(repo, {
      head: "feat-b",
      base: "main",
      title: "B",
      body: "",
    });
    expect(a.number).toBe(1);
    expect(b.number).toBe(2);
    expect(api.pullsOpened).toHaveLength(2);
  });

  it("listPullRequests filters by state and base", async () => {
    const api = new FakeGitHubApi();
    await api.openPullRequest(repo, { head: "f1", base: "dev", title: "1", body: "" });
    await api.openPullRequest(repo, { head: "f2", base: "stage", title: "2", body: "" });
    const devPrs = await api.listPullRequests(repo, { base: "dev" });
    expect(devPrs).toHaveLength(1);
    expect(devPrs[0]?.headRef).toBe("f1");
  });

  it("commentOnPullRequest records the body and returns a comment id", async () => {
    const api = new FakeGitHubApi();
    const result = await api.commentOnPullRequest(repo, { prNumber: 42, body: "looks good" });
    expect(result.commentId).toBeGreaterThan(0);
    expect(api.comments[0]?.body).toBe("looks good");
  });
});
