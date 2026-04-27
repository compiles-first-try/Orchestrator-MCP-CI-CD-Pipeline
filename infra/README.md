# infra/

Local-dev orchestration: Postgres, the API server, the Slack bot, and the
mock-orchestrator-mcp. Brings the whole platform up with a single command so
the `sim:commit` flow described in CLAUDE.md works without external
dependencies.

## Quick start

```sh
docker compose up -d            # postgres + api + slack-bot + mock-orchestrator-mcp
pnpm --filter @rpa-platform/db db:migrate
pnpm seed                       # seeds users, framework releases, demo-bot, 4 tenants
```

## What's seeded

- **Users**: one per system role (developer, admin, ba) plus a demo
  service-account user.
- **Roles**: the three system roles from `packages/shared` permission
  catalog. `admin` can mint custom roles via `/rpa role create`.
- **Framework releases**: 1.0.0 (legacy Excel) and 2.0.0 (json-ready).
- **Project**: `demo-bot` with all four tenants in `pending_credentials`
  state. Run `/rpa tenant connect demo-bot dev` to walk through the
  partial-tenant-onboarding flow.

## Mocks

- **mock-orchestrator-mcp** (`infra/mocks/mock-orchestrator-mcp/`) — the
  in-repo MCP server stand-in. Returns an empty tool list at startup
  (matches the production reality per
  `docs/research/uipath-mcp-tool-surface-2026-04-26.md`) plus stub
  REST endpoints for assets/queues/buckets so `sim:commit` round-trips
  without a real UiPath tenant.
- **mock-github-action** — the GitHub Action runs locally as a script
  via `tools/sim-commit` (added with `pnpm sim:commit`). No separate
  service.

## Production note

This stack is **dev-only**. Production deployment (HTTPS termination,
secret management, real Postgres, real Orchestrator endpoints) is
out of scope for v1; CLAUDE.md tracks it for v2.
