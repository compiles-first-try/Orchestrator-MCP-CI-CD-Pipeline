# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

This repository is being built incrementally against the spec `Claude Code Prompt — RPA Platform Engineering System (v5 — partial tenant onboarding)`. The spec is the source of truth for parts not yet implemented — read it before making non-trivial decisions. When code and spec disagree, ask the user which is canonical; do not silently reconcile.

What exists today (per §21 of the spec):

- Monorepo skeleton: pnpm workspaces, Turborepo, shared `tsconfig.base.json`, Prettier.
- `packages/shared` — `RpaPlatformError` hierarchy, `TenantName`, the permissions key catalog, the `can(user, permission, context)` check, and the seeded system-role grants for `developer` / `admin` / `ba`. The §7 matrix is encoded as a test fixture and asserted exhaustively (every cell × every tenant for tenant-scoped permissions); coverage on `src/permissions/**` is gated at 100%.
- `packages/db` — Drizzle schema for all §5 tables (`users`, `roles`, `user_roles`, `projects`, `project_tenants`, `framework_releases`, `annotations`, `audit_log`, `pr_approvals`, `reconciliation_runs`, `credential_values`) plus pg enums for tenant name, tenant status, audit transport, PR approval status, and reconcile status. Initial migration committed at `packages/db/migrations/0000_initial_schema.sql`. A `createDatabase(connectionString)` factory wires Drizzle to `postgres-js`.

What does **not** exist yet (in spec build order): `config-schema`, `framework-version`, `orchestrator-client`, `github-client`, `credential-source`, `xaml-parser`, `config-output`, `config-roundtrip` + `tools/config-cli`, `reconciler`, `apps/api`, `apps/slack-bot`, `apps/github-action`, `templates/rpa-project`, `infra/`. ESLint is also not yet wired — Prettier covers formatting, TypeScript strict mode covers correctness for now.

## What this system is

`rpa-platform` is a Slack-first internal platform that turns ad-hoc UiPath asset management into a Git-driven, audit-trailed, role-gated workflow. One organization, four UiPath tenants (`dev`/`test`/`stage`/`prod`), one shared admin-managed REFramework repo. Slack is the only human surface in v1 — there is no web UI.

The platform is the MCP **client** to UiPath Orchestrator's MCP server. No LLM is in the runtime hot path; this is server-to-server MCP used as an internal adapter.

## Non-negotiable invariants

These come from §0 of the spec. Treat them as constraints, not suggestions:

1. **Governance is a property of every action.** Every state mutation must be role-gated, dry-runnable where destructive, and audit-logged with a `correlation_id`.
2. **Git is the source of truth for config.** The Orchestrator Bucket file is a regenerated downstream artifact — never hand-edit it.
3. **The framework repo is admin-managed and never modified by the platform.** The platform reads it, manages access, and tracks releases. It does not edit framework source code.
4. **Promotion only happens through PR merges**, which means only through the GitHub Action, which means every tenant write is auditable. No human pushes to `test`/`stage`/`main` on project repos.
5. **MCP-primary, REST-fallback for every Orchestrator op.** Tool discovery runs at startup per tenant; per-call transport (`mcp` vs `rest_fallback`) is recorded in the audit row. MCP tool errors bubble up as domain errors; MCP transport errors are not auto-retried on REST.
6. **OAuth2 client credentials (External Application) is the only Orchestrator auth method.** One External App per tenant, registered in Orchestrator Admin UI as a prerequisite. `client_id` stored plain; `client_secret` AES-256-GCM encrypted in `project_tenants.oauth_client_secret_encrypted`. Tokens cached, refreshed at 80% of `expires_in`, never persisted to disk or logs.
7. **Partial tenant onboarding is a first-class state.** A project can be provisioned with some tenants `pending_credentials`. Reconcile against an unconnected tenant must be rejected with `reconcile.blocked_unconfigured_tenant` audit event and a Slack-friendly error.
8. **Annotations are editable on `dev`/`test` only.** Locked on `stage`/`main`.
9. **TypeScript strict, no `any`.** Validate every external boundary with zod. Verbose-but-explicit code over clever code (the maintainer has dyslexia/ADD).

## Architecture (the parts that span multiple files)

### Two MCP layers — don't conflate them

| Layer                          | What                                                         | Who hosts                             | Who calls                            |
| ------------------------------ | ------------------------------------------------------------ | ------------------------------------- | ------------------------------------ |
| UiPath Orchestrator MCP server | Translator that exposes Orchestrator REST/OData as MCP tools | UiPath Cloud (default) or self-hosted | Our API server                       |
| UiPath Orchestrator            | The actual product where tenants live                        | UiPath Cloud / on-prem                | The MCP server, on behalf of our API |

Switching from UiPath Cloud's hosted MCP to self-hosted is an env var change (`ORCHESTRATOR_MCP_URL`), not a code change. Same code path; tool discovery re-runs on boot.

### Reconcile data flow on a `dev` commit

```
dev push → GitHub Action → POST /reconcile/dry-run (API)
  → reconciler diffs against Orchestrator state via packages/orchestrator-client
  → diff posted to Slack (dev auto-applies; test/stage/prod requires approval click)
  → POST /reconcile/apply → writes via MCP-or-REST per op
  → writes Config.json to project Bucket; if framework < JSON-ready, ALSO writes legacy Config.xlsx
  → audit_log row per resource, with correlation_id and transport=mcp|rest_fallback
```

The reconciler **never** calls MCP or REST directly — all Orchestrator interaction goes through `packages/orchestrator-client`, which transparently picks transport per operation.

### Where permissions are enforced (defense in depth)

Three places, all required:

1. **GitHub branch protection** — physical push prevention.
2. **Slack command handlers** — action prevention before any side effect.
3. **API route middleware** — `can(user, permission, context)` from `packages/shared/src/permissions/check.ts` runs on every route.

The permissions matrix in §7 of the spec is the contract. The default system roles (`developer`, `admin`, `ba`) are seeded; `admin` can create custom roles. The matrix tests must hit 100% coverage — every cell.

### Branch ↔ tenant mapping (project repos)

| Branch      | Tenant | Reconcile?                                          |
| ----------- | ------ | --------------------------------------------------- |
| `dev`       | dev    | auto-apply on push                                  |
| `test`      | test   | dry-run on PR, apply on merge with approval         |
| `stage`     | stage  | same, requires `PR_APPROVE_TEST_TO_STAGE`           |
| `main`      | prod   | same, BA-only approval (`PR_APPROVE_STAGE_TO_PROD`) |
| `feature/*` | none   | branch protection only, no reconcile                |

### Config output dual-format (transitional)

`packages/config-output` always writes `Config.json` to the project's Bucket. It **also** writes legacy `Config.xlsx` iff the project's pinned framework version is below the first JSON-ready release (read from `framework_releases.json_ready`). Excel auto-deactivates per-project once the pinned framework version supports JSON — no code change needed for org-wide retirement.

The legacy Excel schema (4 tabs: Settings, Constants, Assets, Constants) must match the existing framework exactly. There is a TODO in `packages/config-output/src/excel-writer.ts` to verify column order against a sample Excel — do not guess; ask the user for the sample before finalizing.

### Three config-editing surfaces

Developer UX is a first-class success criterion. Don't collapse these:

- **VS Code (JSON files in Git)** — single-value tweaks, code review, normal flow.
- **`/rpa config set` (Slack)** — quick fix without leaving Slack; bot opens a tiny PR on the user's behalf. For non-dev tenants, this PR follows the normal approval flow.
- **`pnpm config:export | config:import` (Excel round-trip)** — bulk edits, 4-tenant comparison, non-developer collaboration. Excel files are local-only, never committed.

## Repository layout (target)

```
apps/
  api/                  # Fastify; routes, middleware, jobs (framework-version-check)
  slack-bot/            # Bolt for JS; commands, modals, interactions
  github-action/        # Composite action; calls API, no secrets in CI
packages/
  db/                   # Drizzle schema + migrations
  orchestrator-client/  # MCP-first; REST fallback per op; OAuth2 token manager
  github-client/        # Octokit wrappers
  reconciler/           # Diff + apply (creates → updates → deletes, stop on first error)
  xaml-parser/          # fast-xml-parser; extracts vars/args/activities/annotations
  config-schema/        # JSON Schema + zod validators
  config-output/        # JSON writer + transitional Excel writer
  config-roundtrip/     # Excel export/import dev utility
  framework-version/    # semver compare, JSON-ready detection
  credential-source/    # Pluggable interface; manual (v1), aws (v2 stub)
  shared/               # permissions, errors (RpaPlatformError), types
tools/config-cli/       # pnpm config:export | config:import
templates/rpa-project/  # Repo template for new RPA projects
infra/                  # docker-compose.yml, seed, mocks/mock-orchestrator-mcp
```

## Tech stack

Node 20 LTS, TypeScript 5.x with `strict: true` and `noUncheckedIndexedAccess: true`. pnpm workspaces + Turborepo. Fastify 4 (schema-first), `@slack/bolt` (Socket Mode for local dev, HTTP for prod), Drizzle + Postgres 16, `@octokit/rest` + `@octokit/webhooks`, `@modelcontextprotocol/sdk`, `fast-xml-parser`, `exceljs`, zod, pino, `node:crypto` AES-256-GCM.

**Do not introduce a dependency not listed in §3 of the spec without asking the user.**

## Common commands

Workspace-level (Turborepo orchestrates per-package tasks):

```sh
pnpm install                                       # install all workspace deps
pnpm test                                          # vitest across every package
pnpm typecheck                                     # tsc --noEmit across every package
pnpm build                                         # tsc per package (emits to dist/)
pnpm format                                        # Prettier write
pnpm format:check                                  # Prettier check (CI)
```

Per-package (use `--filter` to scope):

```sh
pnpm --filter @rpa-platform/shared test:coverage   # 100%-gated permissions coverage
pnpm --filter @rpa-platform/db db:generate         # generate a new Drizzle migration from schema.ts
pnpm --filter @rpa-platform/db db:migrate          # apply pending migrations (needs DATABASE_URL)
pnpm --filter @rpa-platform/db db:push             # push schema directly (dev shortcut)
pnpm --filter @rpa-platform/db db:studio           # Drizzle Studio
```

To run a single test file: `pnpm --filter @rpa-platform/shared exec vitest run test/permissions.matrix.test.ts`.

Spec-required commands not yet implemented (will exist once `infra/`, `apps/`, and the round-trip tool land):

```sh
docker compose up -d                               # postgres + api + slack-bot + mock-orchestrator-mcp + mock-github-action
pnpm seed                                          # seeds users, framework releases, demo-bot project, 4 tenants
pnpm slack:dev                                     # opens Bolt Socket Mode connection
pnpm sim:commit dev                                # simulates a commit + Action run against the local API
pnpm config:export <project>                       # generate <project>-config.xlsx locally (4 tabs)
pnpm config:import <project>                       # validate and write the modified xlsx back to JSON files
```

For local dev, `ORCHESTRATOR_MCP_URL` defaults to `http://mock-orchestrator-mcp:4000` (the in-repo mock at `infra/mocks/mock-orchestrator-mcp/`). For the recorded demo, swap it to a real UiPath Cloud MCP endpoint and restart — no code changes.

## Testing strategy (where the bar is high)

- `packages/shared/permissions` — **100% coverage required**, exhaustive matrix.
- `packages/orchestrator-client` — three paths per operation: MCP-success, MCP-tool-missing fallback, MCP-transport-error abort. Plus tool-discovery tests.
- `packages/reconciler` — unit on diff logic; integration via `mock-orchestrator-mcp`.
- `packages/config-roundtrip` — round-trip property test (export → import → equals).
- `packages/config-output` — snapshot tests against known-good JSON + Excel fixtures.
- End-to-end — docker-compose spin-up + `pnpm sim:commit` in CI.

Aim for 80%+ on `packages/`, lighter on `apps/`.

## Scope discipline

v1 explicitly excludes (placeholders only):

- Any modification to framework repo source code.
- Desktop UI / web dashboard. `/rpa edit` returns `"Inline editing arrives in v2 — for now, edit on your machine and commit."`
- AWS Secrets Manager — implement `credential-source` interface with `manual` only; `aws.ts` is a clearly marked stub that throws `NotImplementedError`.
- WYSIWYG XAML canvas — metadata view only.
- Reconciliation of processes/jobs/triggers/folders/users — assets, queues, buckets, credentials only.
- Automatic framework upgrades — the platform proposes; admin clicks Approve to open the bump PR.

If a feature looks like it might bleed into v2, stop and confirm. See §19 for the seams left for v2.

## Style

- TypeScript strict; no `any`; use `unknown` and narrow.
- Validate every external input with zod before use.
- Errors extend a base `RpaPlatformError` with a `code` field. Slack handlers map error codes to user-friendly copy.
- Logging: pino, structured, with `correlation_id` on every log line within a single request/action chain.
- No business logic in route handlers — handlers parse, validate, delegate to services in `packages/`.
- Named exports, not default exports. Functions under ~40 lines.

## Build order

Follow §21 of the spec. The dependency order matters — `packages/shared` (with the permissions matrix tests) and `packages/db` come before anything that depends on them; `packages/orchestrator-client` and `packages/reconciler` come before `apps/api`; templates and seeds come last before docs and polish.

## Git workflow for this branch

Active development branch: `claude/add-claude-documentation-LwYFS`. Commits should be focused; push with `git push -u origin claude/add-claude-documentation-LwYFS`. Do not open a PR unless asked.
