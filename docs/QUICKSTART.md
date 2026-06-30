# rpa-platform — Day-1 testing walkthrough

A copy-paste, scroll-to-the-next-step guide for your first end-to-end run.
Tailored to your specific setup:

- REFramework template at `C:\Users\nickn\OneDrive\Documents\UiPath\ReFramework Base Template`
- Single UiPath Cloud tenant (used as `dev`)
- Personal GitHub account (you are admin of your own repos)
- Windows + PowerShell

If a step fails, **stop** and tell me what you saw — don't push past errors.

---

## Step 0 — Gather your values

Open a scratchpad text file. You'll fill these in as you go through the
steps; you'll paste them all into `.env` near the end.

```
PLATFORM_ENCRYPTION_KEY=
GITHUB_PLATFORM_TOKEN=
GITHUB_USERNAME=                  # your GitHub login
SLACK_BOT_TOKEN=
SLACK_APP_TOKEN=
SLACK_SIGNING_SECRET=
RPA_SLACK_CHANNEL_ID=
UIPATH_ORG=                       # the {org} in cloud.uipath.com/{org}/...
UIPATH_TENANT=                    # the {tenant} in cloud.uipath.com/{org}/{tenant}/...
UIPATH_CLIENT_ID=
UIPATH_CLIENT_SECRET=             # one-time reveal — write it down now
UIPATH_FOLDER_ID=                 # numeric, default folder is usually 1
```

---

## Step 1 — Pre-flight checks

In PowerShell at the repo root:

```powershell
node --version    # need v20+
pnpm --version    # need 9+
docker --version
git --version
```

If any are missing, install before continuing.

---

## Step 2 — Generate the platform encryption key

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Copy the output → paste into your scratchpad as `PLATFORM_ENCRYPTION_KEY`.

---

## Step 3 — Get a GitHub Personal Access Token

1. Go to <https://github.com/settings/tokens> → **Generate new token (classic)**.
2. Name: `rpa-platform-local`. Expiration: 30 days (or your preference).
3. Scopes: tick **`repo`** (the whole group) and **`read:org`**.
4. Generate. Copy the `ghp_...` value → scratchpad as `GITHUB_PLATFORM_TOKEN`.
5. Note your GitHub username (top-right avatar) → scratchpad as `GITHUB_USERNAME`.

---

## Step 4 — Pause OneDrive sync briefly

Your REFramework folder is in OneDrive. While the next step writes a `.git/`
directory and pushes to GitHub, OneDrive can race with file locks.

System tray → OneDrive icon → ⚙ → **Pause syncing → 2 hours**.

(You'll resume later. This is only a precaution.)

---

## Step 5 — Bootstrap the GitHub template repo

> **Important — run from the rpa-platform repo, not from your REFramework folder.**
> The `pnpm init-template` script is defined in the rpa-platform's
> `package.json`. You point at the REFramework folder via `--source-dir`;
> you don't `cd` into it.

> **Never paste your GitHub token into chat, screenshots, or shared docs.**
> Set it as an env var locally and keep it there. If you've leaked one,
> revoke it at <https://github.com/settings/tokens> and generate a new one
> before continuing.

Three commands, run one after the other. The pnpm command is **a single
line** — don't split it across lines with backticks unless you're
comfortable with PowerShell's continuation rules (and remember to press
Enter on an empty line after to execute).

```powershell
cd D:\Projects\Orchestrator-Slack-CI-CD
```

```powershell
$env:GITHUB_PLATFORM_TOKEN = "ghp_paste_your_actual_token_here"
```

```powershell
pnpm init-template -- --source-dir="C:\Users\nickn\OneDrive\Documents\UiPath\ReFramework Base Template" --owner=<your-github-org-or-user> --repo=reframework-base-template --owner-type=auto
```

`--owner-type=auto` (the default) probes GitHub to figure out whether
`--owner` is an org or a user. Pass `org` or `user` only if you want to
force the path or you hit a permission issue with the probe.

> **PowerShell tip — multi-line forms.** If you'd rather use multi-line
> with backtick line continuation, that works too — just remember to press
> **Enter on an empty line** after the last continued line. If you see
> `>>` and nothing happens, that's PowerShell waiting for that empty
> line. Pressing Ctrl+C cancels the half-typed command without running it.

**Watch for these lines (in order):**
```
Initialising git repo at C:\...\ReFramework Base Template…
✓ Initial commit created.
Renaming branch 'master' → 'dev'…    (or 'main' → 'dev')
Creating branch 'test' from 'dev'…
Creating branch 'stage' from 'dev'…
Creating branch 'main' from 'dev'…
Creating <username>/reframework-base-template on GitHub (template, private)…
  detected/forced owner type: User
✓ Remote <username>/reframework-base-template created.
Pushing default branch 'dev' to origin (with -u)…
Pushing remaining branches: test, stage, main…
Setting remote default branch to 'dev'…
Done. Add these to apps/api .env:

  RPA_TEMPLATE_REPO_OWNER=<username>
  RPA_TEMPLATE_REPO_NAME=reframework-base-template
```

**Verify in a browser:**
1. Open `https://github.com/<username>/reframework-base-template`
2. Confirm 4 branches in the dropdown: `dev` (marked *default*), `test`, `stage`, `main`
3. Confirm a green **"Use this template"** button at top-right (means `is_template=true` worked)

If anything looks off, **stop and tell me**. Don't proceed.

---

## Step 6 — Create the Slack app

1. Open <https://api.slack.com/apps> → **Create New App → From an app manifest**.
2. Select your workspace → **Next**.
3. Open `infra/slack-app-manifest.yaml` in your editor, copy the entire file, paste into the manifest text box → **Next** → **Create**.
4. In the new app's left sidebar, click each of these:
   - **Install App** → **Install to workspace** → approve. Copy the **Bot User OAuth Token** (starts with `xoxb-`) → scratchpad as `SLACK_BOT_TOKEN`.
   - **Basic Information → App-Level Tokens → Generate Token and Scopes**. Name: `local-dev`. Add scope: **`connections:write`**. → **Generate**. Copy the `xapp-...` value → scratchpad as `SLACK_APP_TOKEN`.
   - **Basic Information → App Credentials → Signing Secret → "Show"**. Copy → scratchpad as `SLACK_SIGNING_SECRET`.

---

## Step 7 — Create the test Slack channel and grab its ID

1. In Slack desktop, create a private channel. Suggested name: `#rpa-platform-test`.
2. In that channel's message box, type and send: `/invite @rpa-platform`
3. Right-click the channel name → **View channel details** → scroll to the bottom. The **Channel ID** looks like `C0123ABCD9`. Copy → scratchpad as `RPA_SLACK_CHANNEL_ID`.

---

## Step 8 — Get UiPath OAuth credentials

In Orchestrator (your one tenant):

1. Note the `{org}` and `{tenant}` from your URL: `https://cloud.uipath.com/<org>/<tenant>/...`
   → scratchpad as `UIPATH_ORG` and `UIPATH_TENANT`.
2. **Manage Access → Manage Accounts and Groups → External Applications → Add Application**.
3. **Application Type: Confidential application**. Name it `rpa-platform-local`.
4. **Add scopes** → Resource: **Orchestrator API** → click the **Application Scope(s)** tab.
5. Under the **Application Scopes** tab (not User Scopes), tick:
   - `OR.Assets` (Read + Write)
   - `OR.Folders` (Read + Write)
   - `OR.Queues` (Read + Write)
   - `OR.Buckets` (Read + Write)
   - `OR.Execution` (Read + Write)
   - `OR.Administration` (Read)
6. Save. Copy:
   - **App ID** → scratchpad as `UIPATH_CLIENT_ID`
   - **App Secret** (one-time reveal!) → scratchpad as `UIPATH_CLIENT_SECRET`
7. Find your default folder ID: **Folders** in the left sidebar → click your folder → look at the URL for `?fid=N`. Copy → scratchpad as `UIPATH_FOLDER_ID` (often `1` if it's your only folder).

> **If "External Applications" is missing** from the Manage Access menu (free tier limitation), use a Personal Access Token instead: tenant settings → Personal access tokens → Generate. Use the PAT as `UIPATH_CLIENT_SECRET` and any string for `UIPATH_CLIENT_ID`. The rest of the steps work identically.

---

## Step 9 — Configure `.env`

```powershell
cp .env.example .env
notepad .env
```

Fill in (paste from your scratchpad):

```
DATABASE_URL=postgres://rpa:rpa@localhost:5432/rpa_platform
PLATFORM_ENCRYPTION_KEY=<from step 2>

ORCHESTRATOR_REST_BASE_URL=https://cloud.uipath.com/<UIPATH_ORG>/<UIPATH_TENANT>/orchestrator_

SLACK_BOT_TOKEN=<from step 6>
SLACK_SIGNING_SECRET=<from step 6>
SLACK_APP_TOKEN=<from step 6>
RPA_SLACK_CHANNEL_ID=<from step 7>

GITHUB_PLATFORM_TOKEN=<from step 3>
RPA_TEMPLATE_REPO_OWNER=<GITHUB_USERNAME>
RPA_TEMPLATE_REPO_NAME=reframework-base-template
RPA_PROJECT_REPO_OWNER=<GITHUB_USERNAME>

API_PORT=3000
API_BASE_URL=http://localhost:3000
LOG_LEVEL=info
```

Save and close the file.

---

## Step 10 — Boot the local stack

```powershell
docker compose -f infra/docker-compose.yml up -d --build
```

Wait until all 5 containers are listed. Then:

```powershell
pnpm --filter @rpa-platform/db db:migrate
pnpm seed
```

**Verify all containers are healthy:**

```powershell
docker compose -f infra/docker-compose.yml ps
```

You should see 5 services. `postgres` should report `healthy`. The others
should be `running`. If any show `restarting`, something's misconfigured —
check logs:

```powershell
docker compose -f infra/docker-compose.yml logs api slack-bot --tail 50
```

You should see `rpa-platform API listening on :3000` from the api container,
and `rpa-platform Slack bot running (port 3001)` from slack-bot.

If the slack-bot is in a Socket-Mode reconnect loop, your `SLACK_APP_TOKEN`
is wrong — re-check step 6.

---

## Step 11 — First Slack interaction

Switch to Slack desktop. In `#rpa-platform-test`:

```
/rpa help
```

**Expected:** an ephemeral message (only you see it) listing the commands:
`list`, `info`, `reconcile`, `apply`, `new`, `tenant connect`, `edit`, `help`.

If nothing happens, see [`SETUP.md` §11](./SETUP.md#11-troubleshooting).

---

## Step 12 — Provision your first project from the template

In the same channel:

```
/rpa new my-first-bot "Day-1 smoke test" owners=<your-email>
```

(Replace `<your-email>` with your harvard-domain email.)

**Expected:** a channel message with JSON containing:
- `result.repoUrl` → a link to your new GitHub repo
- `project.name` → `my-first-bot`
- `seedTenantSkipped: true` (we haven't connected the tenant yet)
- `nextStep` → tells you to run `/rpa tenant connect` next

**Verify on GitHub:** open `https://github.com/<username>/my-first-bot`. Confirm:
- All 4 branches (`dev` default, `test`, `stage`, `main`)
- The contents look like your REFramework

If the channel message looks like a `permission_denied` error, you're not
mapped to `admin` in the role-mapping (see `apps/api/src/identity.ts`). For
testing, you can either temporarily map your Orchestrator role name to
`"admin"` in `DEFAULT_ROLE_MAPPING`, or assign yourself the `Administrator`
Orchestrator role in your tenant.

---

## Step 13 — Connect your dev tenant

In Slack:

```
/rpa tenant connect
```

A **modal** pops up titled **"Connect tenant credentials"**. Fill in:

| Field | Value |
|---|---|
| Project name | `my-first-bot` |
| Tenant | `dev` |
| OAuth2 client ID | `<UIPATH_CLIENT_ID from scratchpad>` |
| OAuth2 client secret | `<UIPATH_CLIENT_SECRET from scratchpad>` |
| Orchestrator folder ID | `<UIPATH_FOLDER_ID from scratchpad>` (e.g. `1`) |
| Identity token URL | `https://cloud.uipath.com/<UIPATH_ORG>/identity_/connect/token` |
| Orchestrator base URL | (leave blank — uses the .env value) |
| OAuth scopes | leave the default `OR.Default` |

Click **Connect**.

**Expected:** the modal closes. The bot **DMs you** (not a channel message)
with `:white_check_mark: status: "connected", tokenLifetimeSeconds: 3600`
or similar.

If the DM says `:warning: Tenant connect failed: 401 invalid_client`, the
client_id/secret pair is wrong — re-check step 8.

---

## Step 14 — Confirm the encrypted secret in the DB (sanity check)

```powershell
docker compose -f infra/docker-compose.yml exec postgres `
  psql -U rpa -d rpa_platform -c `
  "select tenant_name, status, length(oauth_client_secret_encrypted) as encrypted_len, oauth_scopes from project_tenants where project_id = (select id from projects where name = 'my-first-bot');"
```

**Expected:** one row with `tenant_name=dev`, `status=connected`,
`encrypted_len` between 80 and 200, and `oauth_scopes` containing `OR.Default`.

The encrypted secret should start with `v1.` if you query the column directly
— that's the AES-256-GCM format prefix.

---

## Step 15 — Drive a reconcile against your real tenant

The simplest path for v1 testing is `pnpm sim:commit` — it pretends a
GitHub Action fired a push on the dev branch and posts a reconcile request
to the API. The API talks to your real Orchestrator tenant.

```powershell
pnpm sim:commit dev
```

**Expected:** JSON response showing `correlationId` and a `diff` object.
Since your project's config files are empty, the diff has zero creates,
updates, and deletes. The `audit_log` table in the DB will pick up an
entry for the dry-run.

```powershell
docker compose -f infra/docker-compose.yml exec postgres `
  psql -U rpa -d rpa_platform -c `
  "select created_at, action, target_id, success, transport from audit_log order by created_at desc limit 10;"
```

You should see audit rows from the reconcile flow.

---

## Step 16 — Make a real change and re-reconcile

This is where you observe a real Orchestrator side-effect.

1. Clone your project repo locally (somewhere **outside** OneDrive):

   ```powershell
   cd C:\dev    # or wherever; create the directory if needed
   git clone https://github.com/<username>/my-first-bot.git
   cd my-first-bot
   ```

   You'll land on the `dev` branch by default — confirm with `git branch --show-current` (should print `dev`).

2. Open `config\assets.json` in an editor. It should look like this empty
   shape (because your REFramework template doesn't include it; the platform
   will create the file the first time `/rpa new` runs against a fresh
   tenant). For now, create the file manually with one entry:

   ```json
   {
     "schemaVersion": 1,
     "assets": [
       {
         "name": "smokeTestAsset",
         "description": "Created by my Day-1 walkthrough.",
         "type": "text",
         "value": "hello"
       }
     ]
   }
   ```

3. Commit and push to dev:

   ```powershell
   git add config\assets.json
   git commit -m "Add smoke-test asset"
   git push origin dev
   ```

4. Drive a reconcile against the real configs. (Today, the bot's `/rpa
   apply` doesn't yet fetch config files from GitHub; instead, you trigger
   the reconcile via the same `pnpm sim:commit` for now — but with the
   actual configs you'd pass them through the GitHub Action workflow.)
   For Day-1 verification, the simpler path is to call the API directly
   with curl:

   ```powershell
   $ConfigsBody = Get-Content -Raw -Path "config\settings.json","config\constants.json","config\assets.json","config\queues.json","config\buckets.json","config\credentials.json","config\overrides.json" -ErrorAction SilentlyContinue
   ```

   …actually, the Day-1 minimal verification is just:

   ```powershell
   curl -X POST http://localhost:3000/reconcile/dry-run `
     -H "Content-Type: application/json" `
     -d (Get-Content -Raw -Path "scripts\dry-run-payload.json")
   ```

   For now, the easiest end-to-end check is **§17 below** — log in to
   Orchestrator and manually delete an asset, then re-run `pnpm sim:commit`
   and confirm the diff shows a "create" for the missing asset.

> **Heads up — there's a known gap.** `pnpm sim:commit` posts an empty
> config payload to the API; it doesn't yet read your project's actual
> config files from GitHub. To exercise the full "edit → push → real
> Orchestrator change" loop, the next code increment we need is either:
> (a) wire the GitHub Action workflow into your project repos so a real
> push fires the reconcile, or (b) update `pnpm sim:commit` to git-clone
> your project repo and read the config files. **For your first session
> the platform-side and Slack-side mechanics are what we're verifying,
> not the auto-applied changes.** Tell me when you're ready and I'll
> close that gap.

---

## Step 17 — Verify the Slack-side guarantees

Confirm the security guarantees that we documented:

```powershell
# 1. Audit log: should NEVER contain the literal string "client_secret"
docker compose -f infra/docker-compose.yml exec postgres `
  psql -U rpa -d rpa_platform -c `
  "select count(*) from audit_log where after::text like '%client_secret%';"
# expect: 0

# 2. The encrypted client_secret format
docker compose -f infra/docker-compose.yml exec postgres `
  psql -U rpa -d rpa_platform -c `
  "select substring(oauth_client_secret_encrypted from 1 for 5) as prefix from project_tenants where status='connected';"
# expect: 'v1.'

# 3. Plain secret should NOT appear in API logs
docker compose -f infra/docker-compose.yml logs api | Select-String -Pattern "client_secret" -CaseSensitive:$false
# expect: no matches (or only in route-validation error messages, never the value)
```

---

## What to tell me when you're done

After you finish (or get stuck), tell me:

1. **Which step** you got to (or stopped at).
2. The exact output you saw (paste it; redact your tokens).
3. Anything that surprised you in the logs or Orchestrator UI.

Then we'll either close the gap from §16 (so push-to-dev triggers a real
reconcile end-to-end) or build the next-most-useful feature based on what
you actually need to demonstrate.

---

## Sanity-check appendix — what each container does

| Container | Port | Role |
|---|---|---|
| `postgres` | 5432 | Platform DB |
| `mock-orchestrator-mcp` | 4000 | Stand-in Orchestrator for offline tests (you're using the real one for `dev`) |
| `mock-github-action` | 4100 | Receives `pnpm sim:commit` and fires the API call |
| `api` | 3000 | The Fastify platform server |
| `slack-bot` | 3001 | Bolt app connected to your Slack workspace via Socket Mode |

If `slack-bot` keeps restarting, `docker compose logs slack-bot` will tell
you why. The most common cause is a wrong `SLACK_APP_TOKEN` — re-do step 6.4.
