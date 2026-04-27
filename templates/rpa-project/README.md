# {project-name}

This repository is an rpa-platform project. Each long-lived branch maps to a
UiPath tenant: `dev`, `test`, `stage`, `main` → `prod`. The seven JSON files
in this repository describe what should exist in the corresponding tenant
(assets, queues, buckets, credentials, etc.). The platform reconciles them
via the GitHub Action in `.github/workflows/reconcile.yml`.

## Layout

```
settings.json     # REFramework runtime settings (key/value)
constants.json    # Immutable values
assets.json       # UiPath Assets (text/integer/boolean/credential)
queues.json       # Queue definitions
buckets.json      # Storage buckets
credentials.json  # Credential definitions (no secrets)
overrides.json    # Optional per-asset value overrides
```

Secrets (credential values, OAuth client_secret) are stored in the
rpa-platform's encrypted `credential_values` table and never live in this
repo.

## Branch ↔ tenant mapping

| Branch  | Tenant | Reconcile?                                          |
| ------- | ------ | --------------------------------------------------- |
| `dev`   | dev    | auto-apply on push                                  |
| `test`  | test   | dry-run on PR, apply on merge with approval         |
| `stage` | stage  | requires `PR_APPROVE_TEST_TO_STAGE`                 |
| `main`  | prod   | BA-only approval (`PR_APPROVE_STAGE_TO_PROD`)       |
| `feature/*` | none | branch protection only, no reconcile             |

Direct pushes to `test`, `stage`, and `main` are blocked by branch protection.
All promotions go through PR merges.

## Editing config

- **VS Code (this repo)** — single-value tweaks, code review, normal flow.
- **`/rpa config set`** in Slack — quick fix without leaving Slack; bot opens
  a PR on your behalf.
- **`pnpm config:export <project>`** — bulk edits in Excel; round-trip
  preserves values per tenant.

## What this project does NOT contain

Do not commit:
- Actual credential values (use the platform's credential management).
- `*.xlsx` files (they're a local-only round-trip artifact).
- Anything under `.tmp/` or `dist/`.
