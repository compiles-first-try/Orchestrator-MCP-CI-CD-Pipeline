# rpa-platform reconcile action

Composite GitHub Action used by project repos to invoke the platform's
reconcile endpoints. The action holds no secrets of its own — it just
forwards an `API_TOKEN` (provisioned per-repo by the rpa-platform admin)
and the project/tenant context to the API.

## Usage

```yaml
# .github/workflows/reconcile-on-dev-push.yml inside a project repo
on:
  push:
    branches: [dev]

jobs:
  reconcile:
    runs-on: ubuntu-latest
    steps:
      - uses: compiles-first-try/Orchestrator-MCP-CI-CD-Pipeline/apps/github-action@main
        with:
          api-base-url: https://api.rpa.example.com
          api-token: ${{ secrets.RPA_PLATFORM_TOKEN }}
          project: demo-bot
          tenant: dev
          mode: dry-run
```

For `test`/`stage`/`main` branches, the platform posts the dry-run diff to
Slack and waits for an approval click before actually applying. The action
itself is identical for all branches; the API decides what to do based on
the tenant and PR state.
