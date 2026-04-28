# infra/

Local-dev orchestration: Postgres, the API server, the Slack bot, and the
mock-orchestrator-mcp. Brings the whole platform up with a single command so
the `sim:commit` flow described in CLAUDE.md works without external
dependencies.

## Quick start

From the workspace root (one level up from this directory):

```sh
# 1. Generate a 32-byte AES key for the platform (run once, save it locally).
#    Linux/macOS:
openssl rand -base64 32
#    Windows PowerShell:
[Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))

# 2. Export it (and any other env you want to override) before bringing the stack up.
#    Linux/macOS:
export RPA_PLATFORM_ENCRYPTION_KEY="<paste base64 from step 1>"
#    Windows PowerShell:
$env:RPA_PLATFORM_ENCRYPTION_KEY = "<paste base64 from step 1>"

# 3. Bring everything up.
docker compose -f infra/docker-compose.yml up -d --build

# 4. Run migrations + seed.
pnpm --filter @rpa-platform/db db:migrate
pnpm seed
```

### Windows 11 + Docker Desktop notes

- Docker Desktop must be running with the **WSL 2 backend** (Settings → General).
- Clone this repo with `core.autocrlf=input` or `false` so shell scripts
  inside containers don't get CRLF line endings. The `.gitattributes`
  at the workspace root already pins `eol=lf` for source files; on a
  fresh clone Git will respect that.
- If `docker compose` complains about the build context being too
  large, double-check that `.dockerignore` at the workspace root is
  present — it excludes `node_modules` (~hundreds of MB) and `dist`.
- Ports 3000 (api), 3001 (slack-bot), 4000 (mock-orchestrator-mcp),
  and 5432 (postgres) must be free on the Windows host. If you have
  another Postgres running, change the host-side mapping in
  `docker-compose.yml`.

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
