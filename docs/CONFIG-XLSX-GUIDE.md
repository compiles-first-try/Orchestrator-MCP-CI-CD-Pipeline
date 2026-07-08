# Config.xlsx — the single source of truth

The CI/CD pipeline reads **`Data/Config.xlsx`** (the same file your REFramework
robot already uses) and provisions UiPath Orchestrator from it: folder, per-tenant
assets, queues, and buckets. Packages and libraries live in a small companion file,
`orchestrator-packages.json`.

There is **no more `orchestrator-manifest.json`.** One spreadsheet drives everything.

---

## Table of contents

1. [How it fits together](#how-it-fits-together)
2. [The tabs](#the-tabs)
3. [The three standard tabs (robot reads these)](#the-three-standard-tabs)
4. [The Pipeline tab](#the-pipeline-tab)
5. [The per-tenant asset tabs](#the-per-tenant-asset-tabs)
6. [The Queues tab](#the-queues-tab)
7. [The Buckets tab](#the-buckets-tab)
8. [orchestrator-packages.json](#orchestrator-packagesjson)
9. [Credentials — never in the spreadsheet](#credentials)
10. [Validate before you push](#validate-before-you-push)
11. [What the pipeline does](#what-the-pipeline-does)
12. [Safety: additive by default](#safety-additive-by-default)
13. [Regenerating the sample](#regenerating-the-sample)

---

## How it fits together

```
Data/Config.xlsx
├── Settings          ─┐
├── Constants          ├─ read by the ROBOT at runtime (unchanged REFramework behaviour)
├── Assets            ─┘
├── Pipeline          ─┐
├── Dev Assets         │
├── Test Assets        │
├── Stage Assets       ├─ read by the PIPELINE (deploy.ts); the robot IGNORES these
├── Prod Assets        │
├── Queues             │
└── Buckets           ─┘

orchestrator-packages.json  ─ read by the PIPELINE (nuget packages + libraries)
```

The robot only opens the sheets it's told about (`Settings`, `Constants`, `Assets`).
Every extra tab is invisible to the robot — verified against the REFramework
`InitAllSettings.xaml` read logic — so adding pipeline tabs is safe.

---

## The tabs

| Tab | Read by | Columns |
|-----|---------|---------|
| `Settings` | Robot | `Name` \| `Value` \| `Description` |
| `Constants` | Robot | `Name` \| `Value` \| `Description` |
| `Assets` | Robot | `Name` \| `Asset` \| `Description` |
| `Pipeline` | Pipeline | `Key` \| `Value` |
| `Dev Assets` | Pipeline | `Name` \| `Type` \| `Value` \| `Description` |
| `Test Assets` | Pipeline | `Name` \| `Type` \| `Value` \| `Description` |
| `Stage Assets` | Pipeline | `Name` \| `Type` \| `Value` \| `Description` |
| `Prod Assets` | Pipeline | `Name` \| `Type` \| `Value` \| `Description` |
| `Queues` | Pipeline | `Name` \| `Description` \| `MaxRetries` \| `AutoRetry` \| `UniqueReference` \| `Encrypted` |
| `Buckets` | Pipeline | `Name` \| `Description` |

> **Header row rule:** every tab's headers must be on **row 1**. Don't insert a
> title or note row above the headers — the parser reads row 1 as the header row.

> **Tab-name tolerance:** tab-name matching is case-insensitive and ignores spaces
> and hyphens. `Dev Assets`, `dev assets`, and `dev-assets` all resolve to the dev
> tenant. The only thing that must match is the tenant word (`dev`/`test`/`stage`/`prod`).

---

## The three standard tabs

These are the normal REFramework tabs. **Don't rename them or their headers** —
the robot reads them at runtime.

- **Settings / Constants** — `Name | Value | Description`. Literal values the robot
  reads via `Config("...")`.
- **Assets** — `Name | Asset | Description`. Note the second column is **`Asset`**,
  not `Value`. The `Asset` column holds the **Orchestrator asset name** the robot
  fetches live at runtime; `Name` is the key your workflow reads.

**The link to the pipeline:** the asset name you put in the `Asset` column here is the
same name you create in the per-tenant asset tabs below. The robot reads asset
`Test_1_Environment`; the pipeline *creates* `Test_1_Environment` in each tenant with
the right per-tenant value.

---

## The Pipeline tab

Key/value metadata. Two columns: `Key` | `Value`.

| Key | Value | Meaning |
|-----|-------|---------|
| `ProjectName` | `Test_1` | Human-readable label (logs/summary only) |
| `RepoName` | `Test_1` | The GitHub repo name (metadata) |
| `FolderPath` | `Unattended Automations/Test_1` | Orchestrator folder path — `/` separates nested folders |

`FolderPath` is the folder the pipeline ensures exists and where it creates assets,
queues, and buckets. To find yours: open Orchestrator, read the folder tree left-to-right,
join with `/`. Example: `Unattended Automations/Campus Services/FoodPro Invoice Processing`.

---

## The per-tenant asset tabs

One tab per tenant: `Dev Assets`, `Test Assets`, `Stage Assets`, `Prod Assets`.
Columns: **`Name` | `Type` | `Value` | `Description`**.

| Column | Meaning |
|--------|---------|
| `Name` | The Orchestrator asset name (matches the `Asset` column on the standard Assets tab) |
| `Type` | `text`, `integer`, `bool`, or `credential` |
| `Value` | The value for **this tenant** (leave blank for `credential`) |
| `Description` | Shown in the Orchestrator UI |

The pipeline reads only the tab for the tenant it's deploying to:

| Push / merge to branch | Tenant | Tab used |
|------------------------|--------|----------|
| `dev` | dev | `Dev Assets` |
| `test` | test | `Test Assets` |
| `stage` | stage | `Stage Assets` |
| `main` | prod | `Prod Assets` |

Example `Dev Assets`:

| Name | Type | Value | Description |
|------|------|-------|-------------|
| `Test_1_Environment` | text | `Development` | Environment label |
| `Test_1_ApplicationUrl` | text | `https://dev-app.example.com` | App URL |
| `Test_1_MaxRetries` | integer | `3` | Retry attempts |
| `Test_1_IsEnabled` | bool | `TRUE` | Master switch |

The same asset names appear in all four tenant tabs; only the values differ. That's
how one asset gets a dev value and a different prod value.

---

## The Queues tab

Columns: `Name` | `Description` | `MaxRetries` | `AutoRetry` | `UniqueReference` | `Encrypted`.

| Column | Type | Maps to Orchestrator |
|--------|------|----------------------|
| `Name` | text | Queue name |
| `Description` | text | Description |
| `MaxRetries` | number | `MaxNumberOfRetries` |
| `AutoRetry` | TRUE/FALSE | `AcceptAutomaticallyRetry` |
| `UniqueReference` | TRUE/FALSE | `EnforceUniqueReference` |
| `Encrypted` | TRUE/FALSE | `Encrypted` (AES-256 at rest) |

---

## The Buckets tab

Columns: `Name` | `Description`. The pipeline generates the required Orchestrator
`Identifier` GUID for you.

---

## orchestrator-packages.json

The one thing that doesn't belong in a spreadsheet. Lives at the repo root.

```json
{
  "packages": [
    { "path": "output/*.nupkg", "autoVersion": true }
  ],
  "libraries": [
    { "path": "libraries/*.nupkg", "autoVersion": true }
  ],
  "processes": []
}
```

- `path` — glob (relative to repo root) to the `.nupkg` UiPath Studio publishes.
  The package name + version are read from the filename.
- `autoVersion` — if that version already exists in Orchestrator, bump to
  `-cicd.N` instead of failing.
- Leave an array empty (`[]`) if this project has no packages/libraries yet.

---

## Credentials

Credential-type assets **never** take their secret from the spreadsheet — the file
is in Git. On a `credential` row you set `Name`, `Type=credential`, and leave `Value`
blank. The pipeline pulls the secret from environment variables (wired to GitHub
Secrets):

- `CRED_<ASSETNAME>_PASSWORD` — required (the secret)
- `CRED_<ASSETNAME>_USERNAME` — optional (defaults to blank, or the `Value` cell)

`<ASSETNAME>` is the asset name upper-cased with non-alphanumerics turned into `_`.
Example: asset `Test_1_ServiceAccount` → `CRED_TEST_1_SERVICEACCOUNT_PASSWORD`.

If the password env var isn't set, the credential asset is **skipped with a warning**
(the deploy doesn't fail). To wire it up, add the secret in GitHub and pass it through
in the workflow's `env:` block.

---

## Validate before you push

You can parse and print the whole config **without touching Orchestrator** — no
credentials needed:

```bash
npm install
TENANT=dev npx tsx scripts/deploy.ts --validate
```

It prints exactly what would be created for that tenant. Run it for each tenant to
sanity-check per-tenant values before you ever push. This catches typos (a misnamed
tab shows `Assets (0)` with a NOTE).

---

## What the pipeline does

On push to `dev` (or PR merge to `test`/`stage`/`main`) the workflow:

1. Reads `Data/Config.xlsx` and `orchestrator-packages.json`
2. Authenticates to the tenant's Orchestrator (OAuth2 from GitHub Secrets)
3. Ensures the `FolderPath` folder exists (creates missing parents)
4. Creates/updates the tenant's assets
5. Creates queues (create-only)
6. Creates buckets (create-only)
7. Uploads packages and libraries (auto-bumping versions on conflict)
8. Writes `deployment-summary.json` to the Actions log

---

## Safety: additive by default

Assets are **create + update only**. The pipeline does **not** delete assets that
aren't in your sheet, because Orchestrator folders are often shared across projects
and a blind delete would wipe another team's assets. If you truly want the sheet to
be authoritative and prune extras, set `PRUNE_ASSETS=true` in the workflow env
(credential assets are never pruned).

---

## Two ways to get a Config.xlsx

There are two scripts, for two situations:

| Situation | Script | What it does |
|-----------|--------|--------------|
| **Brand-new project** (no `Config.xlsx` yet) | `npm run make-config` | Writes a fresh `Data/Config.xlsx` with all 10 tabs + sample data. **Overwrites** any existing file. |
| **Existing project / the dev template** (already has a real `Config.xlsx`) | `npm run upgrade-config` | **Adds** the pipeline tabs to your existing file and leaves Settings/Constants/Assets untouched. |

### Upgrading an existing Config.xlsx (the dev rollout)

Your devs already have `Config.xlsx` files full of real Settings/Constants/Assets.
To move them to the new format **without touching their existing content**, run the
upgrade script — it only adds the missing pipeline tabs:

```bash
npm install
npm run upgrade-config                 # upgrades Data/Config.xlsx in place
# or a specific file:
npx tsx scripts/add-pipeline-tabs.ts path/to/Config.xlsx
```

What it does:

- Adds `Pipeline`, `Dev/Test/Stage/Prod Assets`, `Queues`, `Buckets` **only if they
  don't already exist** (idempotent — safe to re-run).
- Leaves `Settings`, `Constants`, `Assets`, and any other existing tab exactly as-is.
- The new per-tenant asset tabs start **empty** (headers only) so you never deploy
  placeholder assets by accident; the `Pipeline` tab is seeded with the three keys
  (`ProjectName`, `RepoName`, `FolderPath`) with blank values to fill in.
- Backs up the original to `Config.xlsx.bak` before writing.

**After upgrading:** open the file, set `FolderPath` on the Pipeline tab, and fill in
the per-tenant asset rows. Then `TENANT=dev npx tsx scripts/deploy.ts --validate` to
check it. Because exceljs rewrites the whole workbook, give the Settings/Constants/Assets
tabs a quick visual once-over the first time you run it.

**Rolling it out to the template:** run `upgrade-config` against the
`RPA_HarvardUnifiedFrameworkTemplate` repo's `Data/Config.xlsx`, commit it, and every
new project scaffolded from the template inherits the pipeline tabs.

### Regenerating the sample from scratch

```bash
npm run make-config      # writes a fresh Data/Config.xlsx (overwrites!)
```

Only use this for a new project or to see a fully-worked example — it overwrites.
