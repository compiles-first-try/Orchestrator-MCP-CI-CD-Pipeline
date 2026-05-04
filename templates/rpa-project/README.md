# {project-name}

A Git-driven UiPath RPA project managed by the rpa-platform.

## What lives where

```
config/
  settings.json        # REFramework settings (key → typed scalar)
  constants.json       # Framework constants (immutable at runtime)
  assets.json          # Orchestrator Asset declarations (non-credential)
  queues.json          # Orchestrator Queue declarations
  buckets.json         # Orchestrator Bucket declarations
  credentials.json     # Credential declarations — secret material lives in
                       # the platform, not in this file
  overrides.json       # Per-tenant overrides for any of the above
project.json           # Pinned framework version, owners, links
xaml/                  # The UiPath workflows (Main.xaml, processes/, etc.)
.github/workflows/     # Reconcile workflow that calls the platform API
```

Edits land in Orchestrator only via PR merges:

- `dev` branch → auto-applies to the dev tenant on push.
- `test` / `stage` / `main` → reconcile runs as a dry-run on PR open, applies
  on merge with the corresponding approval permission.

Use `/rpa reconcile <this-project> <tenant>` in Slack to trigger an out-of-band dry-run.
