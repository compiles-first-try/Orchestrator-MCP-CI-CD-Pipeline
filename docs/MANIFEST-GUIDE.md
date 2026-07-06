# How to Configure `orchestrator-manifest.json`

This guide walks you through every field in `orchestrator-manifest.json` — the file that tells the CI/CD pipeline what to create in UiPath Orchestrator when you push code.

**You create one `orchestrator-manifest.json` per RPA project repo**, placed at the repo root (same level as `Main.xaml`, `.git/`, `Framework/`, etc.).

---

## Table of Contents

1. [Where the File Goes](#where-the-file-goes)
2. [Full Field Reference](#full-field-reference)
3. [Real Example: FoodPro Invoice Processing](#real-example-foodpro-invoice-processing)
4. [Minimal Example (Just Assets)](#minimal-example-just-assets)
5. [Field-by-Field Walkthrough](#field-by-field-walkthrough)
6. [How `perEnvironment` Works](#how-perenvironment-works)
7. [How `folderPath` Maps to Orchestrator](#how-folderpath-maps-to-orchestrator)
8. [How Packages Work](#how-packages-work)
9. [What the Pipeline Does With This File](#what-the-pipeline-does-with-this-file)
10. [Common Mistakes](#common-mistakes)
11. [Git Sync Workflow](#git-sync-workflow)

---

## Where the File Goes

```
YourRPAProject/                      <-- repo root
├── .git/
├── .github/
│   └── workflows/
│       └── orchestrator-deploy.yml  <-- the GitHub Actions workflow
├── scripts/
│   └── deploy.ts                   <-- the deployment script
├── Framework/
├── Main.xaml
├── project.json
├── orchestrator-manifest.json      <-- THIS FILE (right here at root)
└── ...
```

The file name must be exactly `orchestrator-manifest.json` (lowercase, no spaces).

---

## Full Field Reference

| Field | Type | Required? | What It Does |
|-------|------|-----------|--------------|
| `project` | string | **Yes** | A human-readable name for your automation. Used in logs and summaries. |
| `folderPath` | string | No | The Orchestrator folder path where resources are created. Uses `/` separators for nested folders. If omitted, resources go to the tenant's root (default) folder. |
| `assets` | array | No | Orchestrator Assets to create/update. These are key-value pairs your automation reads at runtime. |
| `queues` | array | No | Orchestrator Queues to create. Used for transaction-based processing (REFramework Dispatcher/Performer). |
| `buckets` | array | No | Orchestrator Storage Buckets to create. Used for file storage (input/output files). |
| `packages` | array | No | NuGet package files (`.nupkg`) to upload. These are your compiled automation packages. |
| `libraries` | array | No | Library `.nupkg` files to upload. Shared reusable components. |
| `processes` | array | No | Processes (formerly "releases") to create. Links a package to a folder so robots can run it. |

---

## Real Example: FoodPro Invoice Processing

Based on your Harvard Orchestrator folder structure:

```
Unattended Automations/
├── AA&D/
├── Campus Services/
│   ├── CrimsonCatering Invoicing/
│   ├── FoodPro Invoice Processing/    <-- this automation
│   └── HUDS_Invoicing/
├── FAD/
└── HUIT/
```

Here is what `orchestrator-manifest.json` would look like for the **FoodPro Invoice Processing** automation:

```json
{
  "project": "FoodPro Invoice Processing",
  "folderPath": "Unattended Automations/Campus Services/FoodPro Invoice Processing",
  "assets": [
    {
      "name": "FoodPro_Environment",
      "type": "text",
      "value": "Development",
      "description": "Current environment name for logging and config selection",
      "perEnvironment": {
        "dev": "Development",
        "test": "Test",
        "stage": "Staging",
        "prod": "Production"
      }
    },
    {
      "name": "FoodPro_MaxRetries",
      "type": "integer",
      "value": 3,
      "description": "Maximum retry attempts per transaction item"
    },
    {
      "name": "FoodPro_IsEnabled",
      "type": "bool",
      "value": true,
      "description": "Master on/off switch for the automation"
    },
    {
      "name": "FoodPro_OutputFolderPath",
      "type": "text",
      "value": "\\\\server\\share\\FoodPro\\Output",
      "description": "Network path where processed invoices are saved",
      "perEnvironment": {
        "dev": "\\\\devserver\\share\\FoodPro\\Output",
        "test": "\\\\testserver\\share\\FoodPro\\Output",
        "stage": "\\\\stageserver\\share\\FoodPro\\Output",
        "prod": "\\\\prodserver\\share\\FoodPro\\Output"
      }
    },
    {
      "name": "FoodPro_EmailRecipients",
      "type": "text",
      "value": "rpa-dev@harvardrpa.com",
      "description": "Semicolon-separated list of email recipients for notifications",
      "perEnvironment": {
        "dev": "rpa-dev@harvardrpa.com",
        "test": "rpa-test@harvardrpa.com",
        "stage": "rpa-stage@harvardrpa.com",
        "prod": "campus-services@harvard.edu;rpa-team@harvardrpa.com"
      }
    }
  ],
  "queues": [
    {
      "name": "FoodPro_Invoices",
      "description": "Incoming FoodPro invoices to process",
      "maxRetries": 2,
      "autoRetry": true,
      "uniqueReference": true
    }
  ],
  "buckets": [
    {
      "name": "FoodPro_Output",
      "description": "Processed invoice PDFs and reports"
    }
  ],
  "packages": [
    {
      "path": "output/*.nupkg",
      "autoVersion": true
    }
  ],
  "libraries": [],
  "processes": [
    {
      "name": "FoodPro Invoice Processing",
      "packageId": "FoodPro_Invoice_Processing",
      "description": "Processes incoming FoodPro invoices via REFramework"
    }
  ]
}
```

---

## Minimal Example (Just Assets)

If your automation only needs a few assets and nothing else, the manifest can be very short:

```json
{
  "project": "MySimpleBot",
  "folderPath": "Unattended Automations/HUIT/MySimpleBot",
  "assets": [
    {
      "name": "MyBot_ApplicationUrl",
      "type": "text",
      "value": "https://dev-app.example.com",
      "perEnvironment": {
        "dev": "https://dev-app.example.com",
        "test": "https://test-app.example.com",
        "stage": "https://stage-app.example.com",
        "prod": "https://app.example.com"
      }
    }
  ]
}
```

Queues, buckets, packages, libraries, and processes are all optional. Only include what your automation actually uses.

---

## Field-by-Field Walkthrough

### `project` (required)

```json
"project": "FoodPro Invoice Processing"
```

A human-readable label. It appears in deployment logs and the GitHub Actions summary. It does **not** need to match any name in Orchestrator — it is purely for your reference.

### `folderPath` (optional but recommended)

```json
"folderPath": "Unattended Automations/Campus Services/FoodPro Invoice Processing"
```

This is the **Orchestrator folder path** where all resources (assets, queues, buckets, processes) will be created. Use `/` to separate nested folders.

**How to find your folder path:**
1. Open UiPath Orchestrator in your browser
2. Look at the folder tree on the left sidebar
3. Write down the full path from the top-level folder to your target folder, separated by `/`

Example from your setup:
- Top-level: `Unattended Automations`
- Second level: `Campus Services`
- Third level: `FoodPro Invoice Processing`
- Full path: `Unattended Automations/Campus Services/FoodPro Invoice Processing`

If the folder does not exist yet, the pipeline will create it automatically (and any parent folders that are missing).

If you omit `folderPath` entirely, resources are created in the tenant's root (default) folder.

### `assets` (optional)

Assets are key-value pairs that your UiPath automation reads at runtime using the **Get Asset** activity. They let you change configuration without modifying code.

Each asset has:

| Field | Required? | What It Is |
|-------|-----------|------------|
| `name` | **Yes** | The asset name in Orchestrator. Must match what your workflow uses in the **Get Asset** activity. |
| `type` | **Yes** | One of: `"text"`, `"bool"`, `"integer"`, `"credential"` |
| `value` | No | The default value. Used when no `perEnvironment` override matches the current tenant. |
| `description` | No | A description shown in the Orchestrator UI. Helpful for other developers. |
| `perEnvironment` | No | Per-tenant overrides. Keys are tenant names: `dev`, `test`, `stage`, `prod`. |

**How to decide what goes here:** Look at every **Get Asset** activity in your UiPath workflow. Each one references an asset name — that name goes in this list.

**Asset types explained:**

- `"text"` — A string value. URLs, file paths, email addresses, application names.
  ```json
  { "name": "MyBot_AppUrl", "type": "text", "value": "https://example.com" }
  ```

- `"integer"` — A whole number. Retry counts, timeout values, batch sizes.
  ```json
  { "name": "MyBot_MaxRetries", "type": "integer", "value": 3 }
  ```

- `"bool"` — True or false. Feature flags, enable/disable switches.
  ```json
  { "name": "MyBot_IsEnabled", "type": "bool", "value": true }
  ```

- `"credential"` — A username/password pair. **Do NOT put the actual credentials in this file.** The pipeline will create the credential asset in Orchestrator, but you must set the username and password manually in the Orchestrator UI. The manifest only declares that the credential exists.
  ```json
  { "name": "MyBot_ServiceAccount", "type": "credential" }
  ```

### `queues` (optional)

Queues are used by REFramework Dispatcher/Performer patterns. The Dispatcher adds items; the Performer processes them.

| Field | Required? | Default | What It Is |
|-------|-----------|---------|------------|
| `name` | **Yes** | — | Queue name in Orchestrator. Must match what your workflow uses in **Add Queue Item** / **Get Transaction Item**. |
| `description` | No | — | Description shown in Orchestrator UI. |
| `maxRetries` | No | `0` | How many times a failed item is retried before being marked as failed permanently. |
| `autoRetry` | No | `false` | Whether failed items are automatically retried (vs. manual retry). |
| `uniqueReference` | No | `false` | Whether each queue item must have a unique Reference field. Prevents duplicate processing. |
| `encrypted` | No | `false` | Whether queue item data is encrypted at rest in Orchestrator. |

**Example:**
```json
{
  "name": "FoodPro_Invoices",
  "description": "Incoming invoices to process",
  "maxRetries": 2,
  "autoRetry": true,
  "uniqueReference": true
}
```

### `buckets` (optional)

Storage Buckets are for file storage in Orchestrator. Your automation can upload/download files to/from buckets using the **Upload Storage File** and **Download Storage File** activities.

| Field | Required? | What It Is |
|-------|-----------|------------|
| `name` | **Yes** | Bucket name in Orchestrator. |
| `description` | No | Description shown in Orchestrator UI. |

**Example:**
```json
{ "name": "FoodPro_Output", "description": "Processed invoice files" }
```

### `packages` (optional)

These are your compiled UiPath automation files (`.nupkg`). When you publish your project from UiPath Studio, it creates a `.nupkg` file. The pipeline uploads this to Orchestrator.

| Field | Required? | Default | What It Is |
|-------|-----------|---------|------------|
| `path` | **Yes** | — | A file path pattern (glob) relative to the repo root. Example: `"output/*.nupkg"` |
| `autoVersion` | No | `true` | If the same version already exists in Orchestrator, automatically bump the version by adding a `-cicd.N` suffix. |

**Example:**
```json
{ "path": "output/*.nupkg", "autoVersion": true }
```

**Important:** The `.nupkg` file must exist in your repo at the path you specify. If you publish from UiPath Studio to `output/`, then `"output/*.nupkg"` is correct. If no files match the pattern, the pipeline logs a warning and skips this step — it does not fail.

### `libraries` (optional)

Same format as `packages`, but for shared UiPath libraries. Libraries are tenant-scoped (not folder-scoped), so they are available to all folders in the tenant.

### `processes` (optional)

A Process (called a "Release" in older Orchestrator versions) links a package to a folder so robots can run it.

| Field | Required? | What It Is |
|-------|-----------|------------|
| `name` | **Yes** | Display name of the process in Orchestrator. |
| `packageId` | **Yes** | The NuGet package ID. This is the package name from your `project.json` in UiPath Studio (the `name` field, with spaces replaced by underscores). |
| `description` | No | Description shown in Orchestrator UI. |

**How to find your `packageId`:** Open `project.json` in your UiPath project root. Look for the `"name"` field. That is your package ID. Spaces are typically replaced with underscores.

---

## How `perEnvironment` Works

`perEnvironment` lets you set different asset values for each tenant (dev/test/stage/prod). The pipeline automatically picks the right value based on which branch triggered the deployment.

```json
{
  "name": "FoodPro_AppUrl",
  "type": "text",
  "value": "https://dev-foodpro.example.com",
  "perEnvironment": {
    "dev": "https://dev-foodpro.example.com",
    "test": "https://test-foodpro.example.com",
    "stage": "https://stage-foodpro.example.com",
    "prod": "https://foodpro.example.com"
  }
}
```

**How the branch determines the tenant:**

| You push/merge to branch | Pipeline deploys to tenant | Asset value used |
|--------------------------|---------------------------|-----------------|
| `dev` | dev | `perEnvironment.dev` |
| `test` | test | `perEnvironment.test` |
| `stage` | stage | `perEnvironment.stage` |
| `main` | prod | `perEnvironment.prod` |

If `perEnvironment` is not set for an asset, the `value` field is used for all tenants.

If `perEnvironment` is set but a specific tenant key is missing, the `value` field is used as the fallback.

---

## How `folderPath` Maps to Orchestrator

Your Harvard Orchestrator has this folder hierarchy:

```
(tenant root)
└── Unattended Automations/
    ├── AA&D/
    │   └── (automations here)
    ├── Campus Services/
    │   ├── CrimsonCatering Invoicing/
    │   ├── FoodPro Invoice Processing/
    │   └── HUDS_Invoicing/
    ├── FAD/
    │   └── (automations here)
    └── HUIT/
        ├── ITSM/
        ├── Network Operations/
        └── (more sub-folders)
```

The `folderPath` in your manifest uses `/` separators and matches the hierarchy exactly:

| Automation | `folderPath` value |
|------------|-------------------|
| FoodPro Invoice Processing | `"Unattended Automations/Campus Services/FoodPro Invoice Processing"` |
| CrimsonCatering Invoicing | `"Unattended Automations/Campus Services/CrimsonCatering Invoicing"` |
| An ITSM automation | `"Unattended Automations/HUIT/ITSM"` |
| A new FAD automation | `"Unattended Automations/FAD/MyNewBot"` |

The pipeline creates any missing folders automatically. If `Unattended Automations/FAD/MyNewBot` does not exist, it will create `MyNewBot` inside `FAD`.

---

## How Packages Work

When you **Publish** from UiPath Studio, it creates a `.nupkg` file. The typical flow:

1. In UiPath Studio, click **Publish** → it creates something like `FoodPro_Invoice_Processing.1.0.0.nupkg`
2. You put this file in an `output/` folder in your repo (or wherever you configure)
3. In your manifest, you set `"path": "output/*.nupkg"`
4. When the pipeline runs, it finds the `.nupkg`, reads the version from the filename, and uploads it

**Version bumping:** If version `1.0.0` already exists in Orchestrator (from a previous deploy), the pipeline automatically uploads it as `1.0.0-cicd.1`. Next time it would be `1.0.0-cicd.2`, and so on. This prevents version conflicts.

**If you do not publish `.nupkg` files to your repo**, just leave the `packages` array empty (`[]`) or omit it entirely. The pipeline will skip package upload.

---

## What the Pipeline Does With This File

When you push to `dev` (or merge a PR to `test`/`stage`/`main`), the GitHub Actions workflow:

1. **Reads** `orchestrator-manifest.json` from your repo root
2. **Authenticates** to UiPath Orchestrator using the OAuth2 credentials stored in GitHub Secrets
3. **Ensures folders** exist (creates missing ones from `folderPath`)
4. **Syncs assets** — creates new ones, updates changed values, deletes assets that are in Orchestrator but NOT in your manifest
5. **Syncs queues** — creates new ones (does not delete existing queues)
6. **Syncs buckets** — creates new ones (does not delete existing buckets)
7. **Uploads packages** — uploads `.nupkg` files, auto-bumping versions if needed
8. **Uploads libraries** — same as packages but tenant-scoped
9. **Syncs processes** — creates process entries linking packages to folders
10. **Writes a summary** to `deployment-summary.json` and posts it to the GitHub Actions log

**Important about asset deletion:** If you remove an asset from the manifest and push, the pipeline will **delete** that asset from Orchestrator. This is intentional — the manifest is the source of truth. Exception: credential-type assets are never auto-deleted.

---

## Common Mistakes

1. **Wrong folder path separators.** Use `/` not `\`. Write `"Unattended Automations/Campus Services"`, not `"Unattended Automations\\Campus Services"`.

2. **Asset name does not match the Get Asset activity.** The `name` in the manifest must be **exactly** what your UiPath workflow passes to the **Get Asset** activity. Case-sensitive.

3. **Putting credentials in the manifest.** Never put actual passwords or secrets in this file. For credential assets, just declare the name and type — set the actual username/password in the Orchestrator UI manually.

4. **File not named exactly `orchestrator-manifest.json`.** It must be lowercase, no spaces, at the repo root.

5. **Forgetting `perEnvironment` for values that differ per tenant.** If your dev server URL is different from prod, you need `perEnvironment`. Otherwise the same value deploys to all tenants.

---

## Git Sync Workflow

You said you cloned this personal repo (`compiles-first-try/Orchestrator-MCP-CI-CD-Pipeline`) to your work machine. To pull updates I push here:

```bash
# On your work machine, inside the cloned repo folder:

# First time only — make sure you have the right remote:
git remote -v
# Should show: origin  https://github.com/compiles-first-try/Orchestrator-MCP-CI-CD-Pipeline.git

# Pull the latest changes from the default branch:
git fetch origin
git pull origin claude/add-claude-documentation-LwYFS

# Or if you want a specific branch:
git fetch origin claude/gracious-bohr-s30NY
git checkout claude/gracious-bohr-s30NY
git pull origin claude/gracious-bohr-s30NY
```

Then copy the files you need (`scripts/deploy.ts`, `.github/workflows/orchestrator-deploy.yml`, `orchestrator-manifest.json`) into your `RPA_HarvardUnifiedFrameworkTemplate` repo on the `cicd-pipeline` branch.
