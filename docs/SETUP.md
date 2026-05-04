# rpa-platform — setup & testing guide

End-to-end instructions to run the platform locally, bootstrap a GitHub
template repo from your REFramework folder, and exercise every Slack
command. Tested on Windows 11 (PowerShell + Git Bash) and macOS.

> Skim time: ~10 min. First-time setup with a real Slack/UiPath/GitHub
> account: ~30–45 min, mostly waiting on credential issuance.

---

## 1. What you'll set up

| Component | Purpose |
|---|---|
| **Local stack** | Postgres + API + Slack bot + mock Orchestrator (Docker Compose) |
| **GitHub template repo** | Your REFramework, marked as a GitHub *template repo*, source for `/rpa new` |
| **Slack app** | One slash command (`/rpa`) wired to your bot, single test channel |
| **UiPath credentials** | OAuth2 External Application *or* Personal Access Token |

You'll end with a single Slack channel where every command works.

---

## 2. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 20 LTS or newer | `node --version` |
| pnpm | 9+ | `corepack enable` then `corepack use pnpm@latest` |
| Docker Desktop | recent | for Postgres + mocks |
| Git | recent | `git --version` |
| GitHub account | — | must be able to create repos under your user or an org |
| Slack workspace | — | must have admin rights to install a custom app |
| UiPath account | Automation Cloud | Community tier works for read-only smoke tests |

---

## 3. Clone, install, run tests

```sh
git clone git@github.com:compiles-first-try/Orchestrator-MCP-CI-CD-Pipeline.git
cd Orchestrator-MCP-CI-CD-Pipeline
pnpm install
pnpm typecheck
pnpm test
```

You should see ~600 tests pass across 12 packages/apps. If anything fails
at this stage, stop and resolve it before continuing.

---

## 4. Bootstrap your REFramework as a GitHub template repo

You provide a local folder containing the REFramework. The CLI initialises
git, creates the GitHub repo as a *template*, and pushes.

### 4.1 Generate a GitHub Personal Access Token

GitHub → **Settings → Developer settings → Personal access tokens → Tokens (classic)**
→ Generate new token. Scopes: `repo` (full), `read:org`. Copy it; you won't
see it again.

```sh
# PowerShell
$env:GITHUB_PLATFORM_TOKEN = "ghp_xxxxxxxxxxxxxxxxxxxxxxxx"

# Bash / zsh
export GITHUB_PLATFORM_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxx
```

### 4.2 Run the CLI

Point it at your REFramework folder. Replace `<owner>` with your GitHub
user or org and pick a repo name:

```sh
pnpm init-template -- \
  --source-dir="C:/Users/you/path/to/REFramework" \
  --owner=<owner> \
  --repo=rpa-reframework-template
```

What it does:
1. Runs `git init` if the folder isn't already a repo, stages everything,
   commits "Initial REFramework template".
2. Sets up the four-branch layout — `dev`, `test`, `stage`, `main` — all
   pointing at the initial commit. **`dev` is the default branch**, so a
   fresh `git clone` of the template (or a project repo generated from it)
   lands on `dev`.
3. Calls GitHub API to create `<owner>/<repo>` with `is_template: true`
   (private by default; pass `--public` to override).
4. Adds `origin`, pushes all four branches, and sets `dev` as the remote
   default branch.
5. Prints two env-var lines for step 7.

If the remote repo already exists, the CLI skips creation and just pushes.
If the local folder already has `.git` with branches, the CLI skips
re-creating any that exist (idempotent).

### Why all four branches up front

Per the spec, GitHub branches map 1:1 to UiPath Orchestrator tenants:

| Branch | Tenant | What happens on push / merge |
|---|---|---|
| `dev` | dev | auto-apply on push |
| `test` | test | dry-run on PR open; apply on merge with admin approval |
| `stage` | stage | same; admin OR BA |
| `main` | prod | same; admin OR BA |

A developer's day looks like:

```sh
# Clone a project repo (lands on `dev` because that's the default)
git clone git@github.com:<owner>/<project>.git
cd <project>
# …make changes…
git add . && git commit -m "Add Foo workflow"
git push origin dev          # auto-applies to dev tenant

# When ready to promote to test:
git checkout -b feature/foo-test
gh pr create --base test --head feature/foo-test --title "Promote Foo to test"
# Admin reviews + approves the PR; merging triggers the test-tenant reconcile.
```

### Optional flags

| Flag | Default | When to use |
|---|---|---|
| `--public` | absent (creates private) | Make the template repo public. |
| `--token=<pat>` | reads `GITHUB_PLATFORM_TOKEN` env | Pass the token inline instead of via env. |
| `--owner-type=auto\|org\|user` | `auto` | `auto` probes `GET /users/{owner}` to decide between org and user create endpoints. Pass `org` or `user` to skip the probe and force the path — safer when your token lacks profile-read scope, or when you want a hard-fail on a typo'd `--owner` rather than silently creating under your own user. |
| `--branches=<list>` | `dev,test,stage,main` | Override the branch set if you maintain a different naming convention. Comma-separated. The first one becomes the default branch unless `--default-branch` overrides. |
| `--default-branch=<name>` | first of `--branches` | Pick a default branch other than the first listed. |

Examples:

```sh
# Force the org endpoint (no probe; fails fast if the owner isn't an org)
pnpm init-template -- \
  --source-dir="C:/Users/you/REFramework" \
  --owner=compiles-first-try \
  --repo=rpa-reframework-template \
  --owner-type=org

# Force the user endpoint (creates the repo under your own user account)
pnpm init-template -- --source-dir=… --owner=your-handle --repo=… --owner-type=user

# Public template
pnpm init-template -- --source-dir=… --owner=… --repo=… --public

# Custom branch set (rare — only if your team uses different branch names)
pnpm init-template -- --source-dir=… --owner=… --repo=… \
  --branches=develop,qa,uat,production --default-branch=develop
```

> **Heads up — the folder is now a real git repo.** Future commits to the
> REFramework template happen in that folder; the platform only consumes
> it via the GitHub template-clone API, so any commit you push there
> updates the source for *future* `/rpa new` invocations.

> **OneDrive-synced folders.** Putting a git repo inside `OneDrive\Documents`
> can cause `.git/index.lock` collisions when OneDrive re-syncs during a git
> operation. Workable for solo testing; for team use, move the template
> outside OneDrive (e.g. `C:\dev\rpa-reframework-template`) and let GitHub
> be the single source of truth.

---

## 5. Slack app setup

### 5.1 Create the app from the manifest

1. Open <https://api.slack.com/apps>.
2. **Create New App → From an app manifest** → choose your workspace.
3. Paste the contents of [`infra/slack-app-manifest.yaml`](../infra/slack-app-manifest.yaml).
4. Confirm. Slack creates the app with the right scopes, slash command,
   and interactivity enabled.

### 5.2 Install to workspace

In the app's left sidebar: **Install App → Install to workspace**.
Approve the scopes. Copy the **Bot User OAuth Token** (starts with `xoxb-`).

### 5.3 Generate an App-Level Token (Socket Mode)

For local development we use Socket Mode so you don't need a public URL.

1. **Basic Information → App-Level Tokens → Generate Token and Scopes**.
2. Name it anything; add the `connections:write` scope.
3. Copy the token (starts with `xapp-`).

### 5.4 Get the Signing Secret

**Basic Information → App Credentials → Signing Secret → "Show".**
Copy it.

### 5.5 Pick the test channel and copy its ID

1. Create or pick a private channel (e.g. `#rpa-platform-test`).
2. Right-click the channel name → **View channel details**. The ID is at
   the bottom of the panel (looks like `C0123456789`).
3. Invite the bot to the channel: in the channel's message box, type
   `/invite @rpa-platform`.

Keep the four values handy — you'll paste them into `.env` next.

### 5.6 Using your Slack desktop client

You don't connect anything from your desktop client manually. Once the app
is installed in your workspace (step 5.2):

- **Your existing Slack desktop / mobile / web clients pick it up automatically.**
- Open the workspace where you installed it. The bot user `@rpa-platform`
  is now visible in **Apps** in the left sidebar.
- In the test channel, `/rpa` will autocomplete in the message box. Hit
  enter to send.
- For modals (e.g. `/rpa tenant connect`), the popup appears in whichever
  Slack client you ran the command from — desktop, mobile, web — they're
  all rendered server-side by Slack.

If `/rpa` doesn't autocomplete:
- Confirm the bot is invited to the channel (`/invite @rpa-platform`).
- Confirm the API container is running (`docker compose ps` shows `slack-bot`).
- Tail the bot's logs: `docker compose logs -f slack-bot`. On startup it
  should print `rpa-platform Slack bot running`. If you see a Socket Mode
  reconnect loop, your `SLACK_APP_TOKEN` is wrong or expired.

---

## 6. UiPath credentials (pick one)

### Option A — OAuth2 External Application *(production-recommended)*

In **Orchestrator → Manage Access → Manage Accounts and Groups → External Applications**:

1. **Add Application → Confidential application**.
2. **Add scopes** → Resource: **Orchestrator API** → tab **Application Scope(s)**.
3. Tick at minimum: `OR.Assets`, `OR.Queues`, `OR.Folders.Read`, `OR.Users.Read`,
   `OR.Roles.Read`, `OR.Administration` (or the granular `.Read`/`.Write` variants
   your tenant exposes — exact scope strings vary by Cloud version).
4. Save. Copy the **App ID**, **App Secret** (one-time reveal!), and the
   tenant's identity token URL: typically
   `https://cloud.uipath.com/{org}/identity_/connect/token`.

### Option B — Personal Access Token *(testing fallback if External Apps unavailable on free tier)*

Tenant **settings → Personal access tokens → Generate**. Pick scopes
matching your testing scope. Copy the token.

PATs work via `createStaticTokenSource(token)` already wired in
[`packages/orchestrator-client/src/static-token-source.ts`](../packages/orchestrator-client/src/static-token-source.ts).
For v1 testing this means: leave the modal's `client_id` blank and use the
PAT as the `client_secret` value — the API will treat it as Bearer auth.

> Production deployments must use Option A per spec invariant #6.

---

## 7. Configure `.env`

```sh
cp .env.example .env
```

Fill in the values you collected:

```
PLATFORM_ENCRYPTION_KEY=<32-byte base64; see comment in .env.example for the one-liner>
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_APP_TOKEN=xapp-...
RPA_SLACK_CHANNEL_ID=C0123456789
GITHUB_PLATFORM_TOKEN=ghp_...
RPA_TEMPLATE_REPO_OWNER=<owner>
RPA_TEMPLATE_REPO_NAME=rpa-reframework-template
RPA_PROJECT_REPO_OWNER=<owner>          # or a different org for project repos
ORCHESTRATOR_REST_BASE_URL=             # leave blank for the local mock
```

Generate the encryption key:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

---

## 8. Boot the stack

```sh
docker compose -f infra/docker-compose.yml up -d --build
pnpm --filter @rpa-platform/db db:migrate
pnpm seed
```

Expected:
- `postgres` healthy on port 5432
- `mock-orchestrator-mcp` on 4000
- `api` on 3000
- `slack-bot` on 3001 (also connected to Slack via Socket Mode)

Tail logs:

```sh
docker compose -f infra/docker-compose.yml logs -f api slack-bot
```

You should see `rpa-platform Slack bot running` and `rpa-platform API listening on :3000`.

---

## 9. Smoke test in Slack

In your test channel:

| # | Type | Expected response |
|---|---|---|
| 9.1 | `/rpa help` | Ephemeral message listing all verbs. |
| 9.2 | `/rpa new my-test-bot "smoke test" owners=you@harvard.edu` | Channel message with the new repo URL (admin only). |
| 9.3 | `/rpa tenant connect` | A modal pops up titled **Connect tenant credentials**. The secret is captured here, never typed into the channel. |
| 9.3a | Fill the modal: `project=my-test-bot`, `tenant=dev`, paste your UiPath `client_id` and `client_secret`, `folder_id=1`, `identity_token_url=https://cloud.uipath.com/{org}/identity_/connect/token`. Submit. | DM from the bot with `:white_check_mark: status: "connected"` (or a clear error if validation failed). |
| 9.4 | `/rpa reconcile my-test-bot dev` | Channel message with the diff (creates / updates / *skipped* deletes — the platform never deletes). |
| 9.5 | From a terminal: `pnpm sim:commit dev` | Drives the dry-run reconcile end-to-end via the mock GitHub Action. |

If 9.3a fails with `OrchestratorAuthError`, the `client_secret` was rejected
by UiPath. The platform did **not** persist anything; retry the modal.

### Verify the security guarantees

Run these after 9.3a to confirm the secret never leaked into chat or audit:

```sh
# 1. Postgres: audit_log should never contain the literal string "client_secret"
docker compose -f infra/docker-compose.yml exec postgres \
  psql -U rpa -d rpa_platform -c "select count(*) from audit_log where after::text like '%client_secret%';"
# expect: 0

# 2. The encrypted blob in project_tenants
docker compose -f infra/docker-compose.yml exec postgres \
  psql -U rpa -d rpa_platform -c "select tenant_name, length(oauth_client_secret_encrypted) from project_tenants;"
# expect: ~80-200 chars; starts with 'v1.'

# 3. API logs should NOT contain the secret value
docker compose -f infra/docker-compose.yml logs api | grep -i "client_secret"
# expect: no matches
```

---

## 10. Day-2 operations

### Add another developer

1. They get a Slack account with email under your org's domain (must contain
   `harvard` per the fuzzy-match memory, or set `domainSubstring` on
   `createHarvardFuzzyIdentityResolver` in [`apps/api/src/identity.ts`](../apps/api/src/identity.ts)).
2. They get a UiPath user account with the appropriate Orchestrator role
   (`Developer`, `Administrator`, or `Business Analyst`).
3. They invite themselves to the test channel; `/rpa help` works immediately.

### Connect another tenant (test, stage, prod)

Same `/rpa tenant connect` modal. Pick the tenant from the dropdown, paste
that tenant's OAuth credentials.

### Update the REFramework template

Pull your local REFramework folder, make changes on whatever branch is the
"working" one (e.g. `dev`), commit, push. Future `/rpa new` invocations
pull from the latest state of the template's default branch (`dev`).

### Branch protection — making "Orchestrator role gates GitHub access" real

The platform enforces tenant-level access control in **two layers**:

| Layer | Where | What it does |
|---|---|---|
| **1. GitHub branch protection + CODEOWNERS** | Per project repo | Blocks unauthorised pushes / approvals at the GitHub level. Set up once per repo. |
| **2. rpa-platform matrix + Orchestrator capability check** | apps/api routes | Refuses to proceed if the caller's Orchestrator role doesn't cover the required capability. Already enforced in code (memory: `orchestrator_capability_preflight`). |

Layer 2 runs automatically on every `/rpa` action. Layer 1 you set up
manually per project repo (or via the GitHub API once we add a
`/rpa project setup-branch-protection` admin verb).

For each project repo, configure these branch protection rules in
**Settings → Branches**:

| Branch | Required reviewers | Restrict push |
|---|---|---|
| `dev` | 0 (or 1 from devs CODEOWNERS) | none — devs push directly |
| `test` | 1 from `@<org>/admins` | block direct pushes |
| `stage` | 1 from `@<org>/admins` AND 1 from `@<org>/business-analysts` | block direct pushes |
| `main` | 1 from `@<org>/admins` AND 1 from `@<org>/business-analysts` | block direct pushes |

A `CODEOWNERS` file in the repo root pins the reviewer requirement:

```text
# .github/CODEOWNERS
# When a PR targets `test`, an admin must review.
* @<org>/admins
# stage and main inherit `*`; the branch protection adds the BA group.
```

A user's effective access then composes as:

- **Developer** can push to `dev`, open a PR `dev → test`, but cannot
  approve any PR. Layer 1 (CODEOWNERS) prevents the approve.
- **Admin** can approve `dev → test`, `test → stage`, `stage → main`. They
  can also click `/rpa apply <project> test` in Slack — Layer 2 confirms
  their Orchestrator role covers `Assets.Create` etc. before any wire call.
- **BA** can approve `test → stage` and `stage → main`. Same Layer 2 check
  applies if they trigger a Slack action.

If a user is *missing* the Orchestrator capability for a tenant, Layer 2
rejects the action with a `permission_denied` error naming the missing
capability (`details.missing: ["Assets.Create", …]`) — even if Layer 1
would have allowed the GitHub click. This is intentional: GitHub branch
protection enforces *who can click approve*, while the platform's
Orchestrator capability check enforces *what actually executes against the
tenant*.

### Tail audit log

```sh
docker compose -f infra/docker-compose.yml exec postgres \
  psql -U rpa -d rpa_platform -c \
  "select created_at, action, target_id, success, correlation_id from audit_log order by created_at desc limit 20;"
```

---

## 11. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Bot doesn't respond to `/rpa` in a channel | Bot not invited, or `RPA_SLACK_CHANNEL_ID` set to a different channel | `/invite @rpa-platform` in that channel; or update `RPA_SLACK_CHANNEL_ID` |
| `permission_denied` from `/rpa new` | Caller's Orchestrator role isn't mapped to `admin` in `DEFAULT_ROLE_MAPPING` | Add the role-name in [`apps/api/src/identity.ts`](../apps/api/src/identity.ts) |
| `tenant.connect_validation_failed` 401 | Wrong `client_id`/`client_secret`, or tenant doesn't have External Apps enabled | Re-check Orchestrator App page; try Option B (PAT) |
| `OrchestratorRequestError` 403 with `details.missing` | Caller's Orchestrator role doesn't cover the required capabilities | Promote the user's Orchestrator role, or update `KNOWN_ROLE_CAPABILITIES` in [`orchestrator-capabilities.ts`](../apps/api/src/orchestrator-capabilities.ts) |
| `Unknown command: tenant` | Bot wasn't restarted after env change | `docker compose restart slack-bot` |
| `pnpm init-template` fails with 422 | Repo already exists OR your token can't create in that org | Use a token with `repo` + `admin:org`; or pre-create the repo and re-run (the CLI is idempotent) |
| Repos created without `is_template: true` | Created manually, not via the CLI | GitHub repo **Settings → Template repository → ✓**, then re-run `/rpa new`. |

---

## 12. Where things live

| What | Where |
|---|---|
| Slack manifest | [`infra/slack-app-manifest.yaml`](../infra/slack-app-manifest.yaml) |
| Compose stack | [`infra/docker-compose.yml`](../infra/docker-compose.yml) |
| Mock Orchestrator | [`infra/mocks/mock-orchestrator-mcp/server.js`](../infra/mocks/mock-orchestrator-mcp/server.js) |
| Template repo bootstrap CLI | [`tools/init-template-repo/`](../tools/init-template-repo/) |
| API routes | [`apps/api/src/routes/`](../apps/api/src/routes/) |
| Slack handlers | [`apps/slack-bot/src/commands/handlers.ts`](../apps/slack-bot/src/commands/handlers.ts) |
| Test plan (requirements + exceptions) | [`docs/test-cases.md`](./test-cases.md) |
| UiPath research notes | [`docs/research/`](./research/) |
| CLAUDE.md (project guidance) | [`CLAUDE.md`](../CLAUDE.md) |

---

## 13. Production hardening (before real users)

The current setup is for **single-team testing**. Before opening up:

- Switch Slack from Socket Mode to HTTP mode (set `socket_mode_enabled: false` in the manifest, set the request URL to your public host, drop `SLACK_APP_TOKEN`).
- Replace the Personal Access Token with a GitHub App for finer-grained webhook auth (`GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`).
- Configure CODEOWNERS in your project repos to enforce reviewer-count rules on `test→stage` and `stage→main` PRs (memory: `matrix_dual_approval`).
- Review [`docs/test-cases.md`](./test-cases.md) section 9 — the smoke-checklist that should pass before each release.
