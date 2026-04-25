# Handoff prompt — paste into a new Claude Code session

Use the block below as the first message in a new chat to continue building
the `rpa-platform` system. It is self-contained: it tells the new session
where the repo is, what's done, what's next, and what guardrails to follow.

---

```
We are continuing the build of `rpa-platform`, a Slack-first internal platform
for UiPath RPA development. The project lives at:

  /home/user/Orchestrator-MCP-CI-CD-Pipeline

Active branch: claude/add-claude-documentation-LwYFS
Repo (GitHub MCP scope): compiles-first-try/orchestrator-mcp-ci-cd-pipeline

Before doing anything else:

1. Read CLAUDE.md at the repo root. It captures the non-negotiable invariants,
   the architecture seams, the target layout, what's already built, and what's
   left.
2. The full v5 spec lives in the conversation upload that started this build —
   it is the source of truth for parts not yet implemented. Treat the spec as
   canonical when in doubt; when code and spec disagree, ASK the user before
   reconciling.
3. Run `pnpm test` and `pnpm typecheck` from the repo root to confirm the
   workspace is green before making changes.

What's already built (per §21 of the spec):

- Monorepo skeleton: pnpm workspaces, Turborepo, strict TS (`tsconfig.base.json`),
  Prettier. Node 20 LTS targeted, pnpm 10.
- packages/shared: RpaPlatformError hierarchy (incl. NotImplementedError,
  PermissionDeniedError, TenantNotConnectedError keyed to the spec's
  `reconcile.blocked_unconfigured_tenant` audit code), TenantName, the §7
  permissions matrix encoded as test fixtures and asserted exhaustively
  (every role × permission × tenant cell). Coverage on src/permissions/**
  is gated at 100% and currently green.
- packages/db: Drizzle schema for all §5 tables with pg enums for tenant name,
  tenant status, audit transport, PR approval status, reconcile status.
  Initial migration committed at packages/db/migrations/0000_initial_schema.sql.
  createDatabase() factory wires Drizzle to postgres-js.

What's next (recommended sequence per §21):

4. packages/config-schema — JSON Schema + zod validators for the project
   config files described in §6 (settings.json, constants.json, assets.json,
   queues.json, buckets.json, credentials.json, overrides.json).
5. packages/framework-version — semver compare + JSON-ready detection
   (reads framework_releases.json_ready against a project's pinned version).
6. packages/orchestrator-client — MCP-first client with REST fallback per
   operation, tool discovery at startup, OAuth2 client-credentials token
   manager (cached, refreshed at 80% of expires_in), AES-256-GCM
   encryption of client_secret. Per spec §10.5, do this BEFORE any package
   that depends on it.

Skill available for step 6 (and anything UiPath-facing):

- /uipath-research — defined at .claude/skills/uipath-research/SKILL.md.
  Use it BEFORE implementing orchestrator-client to verify which MCP tools
  UiPath Cloud currently exposes for Assets, Queues, Buckets, Bucket files,
  and Credentials, and whether bucket file upload still requires REST
  fallback. The skill produces dated, cited reports in docs/research/.

Invariants to keep front-of-mind (from CLAUDE.md):

- Governance is a property of every action: role-gated, dry-runnable,
  audit-logged with correlation_id.
- MCP-primary, REST-fallback for every Orchestrator op. Transport choice
  recorded per audit row. MCP transport errors are NOT auto-retried on REST.
- OAuth2 client credentials is the only Orchestrator auth method. client_id
  plain, client_secret AES-256-GCM in the DB, tokens never persisted.
- Partial tenant onboarding is first-class: pending_credentials → connected
  → auth_failed lifecycle. Reconcile against an unconnected tenant must be
  rejected with the spec's exact audit code.
- TypeScript strict, no `any`. Validate every external boundary with zod.
- Don't introduce a dependency not listed in §3 of the spec without asking.
- Don't open a PR unless explicitly asked.

Style discipline (from CLAUDE.md and the project's CLAUDE Code instructions):

- Verbose-but-explicit code over clever code (the maintainer has dyslexia/ADD).
- Named exports, not default exports. Functions under ~40 lines.
- No business logic in route handlers — handlers parse, validate, delegate.
- Default to writing no comments. Only add one when the WHY is non-obvious.
- Don't add error handling, fallbacks, or validation for scenarios that can't
  happen. Trust internal code; only validate at system boundaries.

When you start: confirm you've read CLAUDE.md, summarize what step you're
picking up at, and tell me what you intend to build before you build it.
```

---

## Tips for the new session

- The spec doc is large. If the new session doesn't have it in context, paste
  it (or just §6, §10, §10.5, §21 — those cover the next three packages).
- If the new session asks "should I open a PR" — the answer is no unless the
  user asks.
- The `uipath-research` skill is project-scoped (lives at
  `.claude/skills/uipath-research/SKILL.md`) so it travels with the repo.
