#!/usr/bin/env node
// Bootstraps a UiPath REFramework folder into a GitHub *template* repo so
// `/rpa new` can spawn project repos from it.
//
// Usage:
//   pnpm init-template -- --source-dir=<path> --owner=<gh-org> --repo=<name> [--token=<pat>] [--public]
//
// What it does (idempotent where it can be):
//   1. Validates --source-dir exists and is a directory.
//   2. If the directory has no .git, runs `git init`, stages all files,
//      commits "Initial REFramework template".
//   3. Calls GitHub API to create the remote repo with `is_template: true`.
//      If the repo already exists, prints a warning and skips creation.
//   4. Adds the remote (`origin`) if not present, ensures the default
//      branch is `main`, and pushes.
//   5. Prints the env-var lines you should drop into apps/api .env.
import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { Octokit } from "@octokit/rest";

type OwnerType = "auto" | "org" | "user";

interface CliArgs {
  sourceDir: string;
  owner: string;
  repo: string;
  token: string;
  isPrivate: boolean;
  ownerType: OwnerType;
  // List of branches to create on the template, in declaration order.
  // The first becomes the default branch (where `git clone` lands).
  // Default: dev → test → stage → main, mirroring the GitHub branch ↔
  // UiPath tenant mapping in the spec (CLAUDE.md).
  branches: readonly string[];
  defaultBranch: string;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const args: Record<string, string | boolean> = {};
  for (const raw of argv.slice(2)) {
    if (!raw.startsWith("--")) continue;
    const eq = raw.indexOf("=");
    if (eq === -1) {
      args[raw.slice(2)] = true;
    } else {
      args[raw.slice(2, eq)] = raw.slice(eq + 1);
    }
  }
  const sourceDir = typeof args["source-dir"] === "string" ? args["source-dir"] : undefined;
  const owner = typeof args["owner"] === "string" ? args["owner"] : undefined;
  const repo = typeof args["repo"] === "string" ? args["repo"] : undefined;
  const tokenArg = typeof args["token"] === "string" ? args["token"] : undefined;
  const token = tokenArg ?? process.env["GITHUB_PLATFORM_TOKEN"] ?? process.env["GITHUB_TOKEN"];
  const isPublic = args["public"] === true;

  const ownerTypeRaw = typeof args["owner-type"] === "string" ? args["owner-type"].toLowerCase() : "auto";
  if (ownerTypeRaw !== "auto" && ownerTypeRaw !== "org" && ownerTypeRaw !== "user") {
    fail(`--owner-type must be one of: auto (default), org, user. Got: '${ownerTypeRaw}'`);
  }
  const ownerType = ownerTypeRaw as OwnerType;

  // Branches: comma-separated list, first is the default branch.
  // Default mirrors the GitHub-branch ↔ UiPath-tenant mapping from the spec.
  const branchesRaw =
    typeof args["branches"] === "string" ? args["branches"] : "dev,test,stage,main";
  const branches = branchesRaw.split(",").map((b) => b.trim()).filter((b) => b.length > 0);
  if (branches.length === 0) fail("--branches must list at least one branch.");
  const defaultBranchArg = typeof args["default-branch"] === "string" ? args["default-branch"] : undefined;
  const defaultBranch = defaultBranchArg ?? branches[0]!;
  if (!branches.includes(defaultBranch)) {
    fail(`--default-branch '${defaultBranch}' is not in --branches list (${branches.join(", ")}).`);
  }

  if (sourceDir === undefined || owner === undefined || repo === undefined) {
    fail(
      "Missing required args. Usage:\n" +
        "  pnpm init-template -- --source-dir=<path> --owner=<gh-org-or-user> --repo=<name>\n" +
        "                         [--token=<pat>] [--public] [--owner-type=auto|org|user]\n" +
        "                         [--branches=dev,test,stage,main] [--default-branch=dev]",
    );
  }
  if (token === undefined || token === "") {
    fail("Missing GitHub token. Set GITHUB_PLATFORM_TOKEN env var or pass --token=<pat>.");
  }
  return {
    sourceDir,
    owner,
    repo,
    token,
    isPrivate: !isPublic,
    ownerType,
    branches,
    defaultBranch,
  };
}

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

// `shell: true` was wrong here — on Windows it routed args through cmd.exe
// which re-tokenised them on whitespace, splitting commit messages like
// "Initial REFramework template" into three args. That's the failure mode
// Node 20+ warns about as DEP0190. Without `shell`, spawn handles the
// args array correctly across platforms (and finds `git.exe` on Windows
// via the standard PATH probe with extension lookup).
async function run(cmd: string, args: readonly string[], cwd: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: "inherit" });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(" ")} exited with code ${code}`));
    });
    child.on("error", reject);
  });
}

async function runCapture(cmd: string, args: readonly string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => {
      stdout += d.toString("utf8");
    });
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString("utf8");
    });
    child.on("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`${cmd} ${args.join(" ")} failed (${code}): ${stderr.trim()}`));
    });
    child.on("error", reject);
  });
}

async function ensureGitInitialised(sourceDir: string): Promise<void> {
  const gitDir = path.join(sourceDir, ".git");
  if (existsSync(gitDir)) {
    console.log(`✓ ${sourceDir} is already a git repo.`);
    return;
  }
  console.log(`Initialising git repo at ${sourceDir}…`);
  await run("git", ["init"], sourceDir);
  await run("git", ["add", "."], sourceDir);
  await run("git", ["commit", "-m", "Initial REFramework template"], sourceDir);
  console.log("✓ Initial commit created.");
}

// Set up the four-branch layout per the spec's branch ↔ tenant mapping:
// dev / test / stage / main, all pointing at the same initial commit.
// Whichever branch is `defaultBranch` is the one a fresh `git clone` lands on.
// Idempotent: existing branches are left in place; missing ones are created
// from the current HEAD.
async function ensureBranches(
  sourceDir: string,
  branches: readonly string[],
  defaultBranch: string,
): Promise<void> {
  const currentBranch = await runCapture("git", ["rev-parse", "--abbrev-ref", "HEAD"], sourceDir);

  // Step 1: ensure the default branch exists at HEAD.
  if (currentBranch !== defaultBranch) {
    const existsLocally = await branchExists(sourceDir, defaultBranch);
    if (existsLocally) {
      console.log(`✓ Branch '${defaultBranch}' already exists locally.`);
      await run("git", ["checkout", defaultBranch], sourceDir);
    } else {
      console.log(`Renaming branch '${currentBranch}' → '${defaultBranch}'…`);
      await run("git", ["branch", "-M", defaultBranch], sourceDir);
    }
  }

  // Step 2: ensure every other listed branch exists, pointing at HEAD.
  for (const branch of branches) {
    if (branch === defaultBranch) continue;
    if (await branchExists(sourceDir, branch)) {
      console.log(`✓ Branch '${branch}' already exists locally.`);
      continue;
    }
    console.log(`Creating branch '${branch}' from '${defaultBranch}'…`);
    await run("git", ["branch", branch, defaultBranch], sourceDir);
  }
}

async function branchExists(sourceDir: string, branch: string): Promise<boolean> {
  try {
    await runCapture("git", ["rev-parse", "--verify", `refs/heads/${branch}`], sourceDir);
    return true;
  } catch {
    return false;
  }
}

async function ensureRemoteRepoExists(args: CliArgs): Promise<{ httpsUrl: string; created: boolean }> {
  const octokit = new Octokit({ auth: args.token });

  try {
    const existing = await octokit.repos.get({ owner: args.owner, repo: args.repo });
    if (existing.data.is_template !== true) {
      console.warn(
        `⚠ Repo ${args.owner}/${args.repo} exists but is not marked as a template. ` +
          `You may want to enable "Template repository" in the repo settings.`,
      );
    } else {
      console.log(`✓ Remote ${args.owner}/${args.repo} already exists and is a template.`);
    }
    return { httpsUrl: existing.data.clone_url, created: false };
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status !== 404) {
      throw err;
    }
  }

  console.log(`Creating ${args.owner}/${args.repo} on GitHub (template, ${args.isPrivate ? "private" : "public"})…`);
  // Pick between /user/repos and /orgs/{org}/repos. With --owner-type=auto
  // (default), probe /users/{owner} once and read the `type` field. With
  // --owner-type=org or =user, skip the probe and force the endpoint —
  // safer when the token can't read profiles or when you want a hard-fail
  // on a typo'd owner.
  let isOrg: boolean;
  if (args.ownerType === "auto") {
    const ownerInfo = await octokit.users.getByUsername({ username: args.owner });
    isOrg = ownerInfo.data.type === "Organization";
  } else {
    isOrg = args.ownerType === "org";
  }
  console.log(`  detected/forced owner type: ${isOrg ? "Organization" : "User"}`);

  const created = isOrg
    ? await octokit.repos.createInOrg({
        org: args.owner,
        name: args.repo,
        is_template: true,
        private: args.isPrivate,
        description: "UiPath REFramework template — managed by rpa-platform.",
      })
    : await octokit.repos.createForAuthenticatedUser({
        name: args.repo,
        is_template: true,
        private: args.isPrivate,
        description: "UiPath REFramework template — managed by rpa-platform.",
      });
  console.log(`✓ Remote ${created.data.full_name} created.`);
  return { httpsUrl: created.data.clone_url, created: true };
}

async function ensureRemoteAddedAndPushed(
  sourceDir: string,
  httpsUrl: string,
  branches: readonly string[],
  defaultBranch: string,
): Promise<void> {
  let hasOrigin = true;
  try {
    await runCapture("git", ["remote", "get-url", "origin"], sourceDir);
  } catch {
    hasOrigin = false;
  }
  if (!hasOrigin) {
    console.log(`Adding remote 'origin' → ${httpsUrl}`);
    await run("git", ["remote", "add", "origin", httpsUrl], sourceDir);
  } else {
    console.log("✓ Remote 'origin' already configured.");
  }
  // Push the default branch first so the remote has it as the upstream;
  // then push the rest. We push them all in one batch via `git push origin
  // dev test stage main` after first establishing -u for the default.
  console.log(`Pushing default branch '${defaultBranch}' to origin (with -u)…`);
  await run("git", ["push", "-u", "origin", defaultBranch], sourceDir);
  const others = branches.filter((b) => b !== defaultBranch);
  if (others.length > 0) {
    console.log(`Pushing remaining branches: ${others.join(", ")}…`);
    await run("git", ["push", "origin", ...others], sourceDir);
  }
}

// Once all branches exist on the remote, ask GitHub to set the default
// branch. By default GitHub uses whatever the first push named (so if we
// push `dev` first, that's already the default). This is belt-and-braces
// in case the order ever changes or the repo pre-existed.
async function ensureRemoteDefaultBranch(args: CliArgs, branchName: string): Promise<void> {
  const octokit = new Octokit({ auth: args.token });
  const current = await octokit.repos.get({ owner: args.owner, repo: args.repo });
  if (current.data.default_branch === branchName) {
    console.log(`✓ Remote default branch is already '${branchName}'.`);
    return;
  }
  console.log(`Setting remote default branch to '${branchName}' (was '${current.data.default_branch}')…`);
  await octokit.repos.update({
    owner: args.owner,
    repo: args.repo,
    default_branch: branchName,
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  if (!existsSync(args.sourceDir)) {
    fail(`source-dir not found: ${args.sourceDir}`);
  }
  if (!statSync(args.sourceDir).isDirectory()) {
    fail(`source-dir is not a directory: ${args.sourceDir}`);
  }

  await ensureGitInitialised(args.sourceDir);
  await ensureBranches(args.sourceDir, args.branches, args.defaultBranch);
  const remote = await ensureRemoteRepoExists(args);
  await ensureRemoteAddedAndPushed(args.sourceDir, remote.httpsUrl, args.branches, args.defaultBranch);
  await ensureRemoteDefaultBranch(args, args.defaultBranch);

  console.log("\nDone. Add these to apps/api .env:\n");
  console.log(`  RPA_TEMPLATE_REPO_OWNER=${args.owner}`);
  console.log(`  RPA_TEMPLATE_REPO_NAME=${args.repo}`);
  console.log("");
}

main().catch((err) => {
  console.error("error:", (err as Error).message ?? err);
  process.exit(1);
});
