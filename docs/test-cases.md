# rpa-platform — test cases (requirements & exceptions)

A manual test plan for the v1 surface. Each section has two halves —
**Requirements** (the happy paths the platform must satisfy) and
**Exceptions** (error / denial / drift cases with their expected error
codes). Slack is the test surface; everything is exercised through the
single channel configured by `RPA_SLACK_CHANNEL_ID`.

Conventions used below:

- `@admin@harvard.edu` — Slack user with Orchestrator role `Administrator`.
- `@dev@harvard.edu` — Slack user with Orchestrator role `Developer`.
- `@ba@harvard.edu` — Slack user with Orchestrator role `Business Analyst`.
- "audit" rows refer to entries in `audit_log`. Every action is logged.
- "permission denied" expectations mention the error `code` returned by
  the API (mapped to a Slack-friendly string by the bot).

---

## 1. Provisioning a new project (`/rpa new`)

### Requirements

| # | Action | Pre-conditions | Expected | Audit |
|---|---|---|---|---|
| 1.1 | `/rpa new demo-bot "daily order processing" owners=admin@harvard.edu` | Caller is admin; `RPA_TEMPLATE_REPO_OWNER`/`_NAME` set; `GITHUB_PLATFORM_TOKEN` valid | New repo `<projectRepoOwner>/demo-bot` created from template; intent parsed; response includes `repoUrl` and `seedTenantSkipped: true`; `nextStep` hint points at `/rpa tenant connect`. | One `audit_log` row with `action=create.project`, `success=true`, `correlation_id` matching response. |
| 1.2 | `/rpa new demo-bot "..." framework=2.0.0 owners=admin@harvard.edu` | as 1.1 | Repo created with `frameworkVersion=2.0.0` recorded. | as 1.1 |
| 1.3 | `/rpa new demo-bot ... dev-bucket=42 dev-folder=12 owners=admin@harvard.edu` (after `tenant connect dev` is wired) | dev tenant already connected; bucket id 42 exists | Repo created AND `Config.json` uploaded to bucket 42 in folder 12; `seedConfigSkipped: false`. | Audit rows: `create.project`, `upload.config_file`. |

### Exceptions

| # | Action | Pre-conditions | Expected error / behaviour |
|---|---|---|---|
| 1.E1 | `/rpa new demo-bot ...` | Caller is developer (lacks `PROJECT_PROVISION`) | `PermissionDeniedError`, code `permission_denied`, `details.permission=project.provision`. Bot replies ephemerally. |
| 1.E2 | `/rpa new "bad name with spaces"` | admin | `IntentParseError`, code `intent.parse_failed`, message naming the project-name pattern. No GitHub call made. |
| 1.E3 | `/rpa new demo-bot ...` | repo `demo-bot` already exists in target org | `ProjectProvisioningError`, code `project.provision_template_failed`, GitHub 422 surfaced in `details`. |
| 1.E4 | `/rpa new demo-bot ...` | `RPA_TEMPLATE_REPO_OWNER`/`_NAME` not set | `/projects` route is not registered → bot reports "Unknown command" or 404. |
| 1.E5 | `/rpa new demo-bot ...` | Slack user has no harvard email AND no exact Orchestrator email match | `PermissionDeniedError`, `details.reason=no_orchestrator_identity`. |
| 1.E6 | `/rpa new demo-bot ...` (with seed-bucket args) but `devBucketId` doesn't exist in Orchestrator | admin; tenant connected | Repo gets created (Phase A succeeds) then bucket-write fails with `OrchestratorRequestError` 404. Caller sees "repo created but seed config upload failed". |

---

## 2. Connecting a tenant (`/rpa tenant connect`) — modal flow

> **Security contract** (memory: `no_secrets_in_chat`): The OAuth `client_secret`
> is captured exclusively via a Slack modal (view_submission RPC), never via
> slash-command args, channel text, or message buttons. The bot replies via
> DM, not the channel, so the success/failure context is also not in chat
> scrollback. The secret is encrypted at rest with AES-256-GCM in
> `project_tenants.oauth_client_secret_encrypted`.

### Requirements

| # | Action | Pre-conditions | Expected | Audit |
|---|---|---|---|---|
| 2.1 | `/rpa tenant connect` in the configured channel | Caller is admin | Bot opens a modal titled "Connect tenant credentials" with 8 input fields. No channel message posted. | (No audit yet — modal opened, action not yet taken.) |
| 2.2 | Submit the modal with valid project / tenant / client_id / client_secret / folder_id / identity_token_url | Project exists; OAuth2 External App registered in UiPath tenant | Modal closes; bot DMs caller with `:white_check_mark:` summary including `status: "connected"` and `tokenLifetimeSeconds`. `project_tenants` row upserted: oauth fields populated, secret AES-256-GCM encrypted, `status='connected'`. | `tenant.connect` audit row, success — `details` contain projectName/tenant only, NOT the secret. |
| 2.3 | Submit again with rotated `client_secret` | tenant already connected | Row updated in place (no duplicate). New secret validated; old secret discarded. DM confirms. | `tenant.connect` audit row, success. |
| 2.4 | Submit with custom scopes field: `OR.Default, OR.Assets.Read, OR.Queues.Read` | as 2.2 | Scopes persisted as array in `oauth_scopes`. | as 2.2 |
| 2.5 | The slash command itself produces NO record of the secret | Always | Slash-command history (the user's own auto-suggest), Slack server logs, and any audit export show only `/rpa tenant connect` with NO secret payload. The secret is never typed into the slash-command box. | n/a |

### Exceptions

| # | Action | Pre-conditions | Expected behaviour |
|---|---|---|---|
| 2.E1 | `/rpa tenant connect` opens the modal | Caller is developer (lacks `CREDENTIAL_SET`) | Modal opens (the bot doesn't pre-check yet). On submit, API rejects with `PermissionDeniedError`. DM shows the error. Row untouched. *(TODO: pre-check at modal-open time so the form never appears for non-admins.)* |
| 2.E2 | Submit with wrong `client_secret` | admin | `OrchestratorAuthError` from validation step. **No DB write happens** — existing row (if any) untouched. DM shows "Validation against Orchestrator failed: 401 invalid_client". |
| 2.E3 | Submit with `project=ghost-project` | admin; project doesn't exist | `TenantConnectError`, code `tenant.connect_project_not_found`. DM shows the message. |
| 2.E4 | Submit modal with empty `client_secret` | admin | Modal stays open with field-level error "Required." underneath the secret field. No API call made. |
| 2.E5 | Submit with `identity_token_url=garbage` | admin | zod 400 from API; route never calls the orchestrator-client. DM shows the validation error. |
| 2.E6 | Caller's Orchestrator role lacks `Folders.View`/`Roles.View`/`Users.View` | admin in our matrix; restricted Orchestrator role | `requireCapability` throws `permission_denied`, `details.missing` lists the absent capability(ies). |
| 2.E7 | Audit log inspection | After any 2.* test | `audit_log.after` jsonb column NEVER contains the string "client_secret" or the secret value. Grep test: `SELECT count(*) FROM audit_log WHERE after::text LIKE '%client_secret%'` returns 0. |
| 2.E8 | API server logs inspection | After any 2.* test at default LOG_LEVEL=info | Server logs NEVER contain the secret value (Fastify default request logger excludes bodies). |

---

## 3. Reconcile dry-run + apply

### Requirements

| # | Action | Pre-conditions | Expected |
|---|---|---|---|
| 3.1 | Push to `dev` branch on a project repo → GitHub Action fires `/reconcile/dry-run` | tenant `dev` connected; reconciler enabled | Diff is computed against current Orchestrator state; `creates`/`updates`/`deletes` returned; **no mutations yet** (dry-run). |
| 3.2 | Same push triggers `/reconcile/apply` (auto on dev) | as 3.1 | Creates and updates apply in order. Deletes are reported as `skipped` (memory: `no_orchestrator_deletes`). `Config.json` (and `Config.xlsx` when not json-ready) uploaded to the project's config bucket. |
| 3.3 | Open PR `test → stage`; admin approves in Slack | admin; matrix grants `PR_APPROVE_TEST_TO_STAGE`; Orchestrator role covers required capabilities | PR merge triggers `/reconcile/apply` against tenant `stage`. Audit shows actor=admin. |
| 3.4 | Open PR `stage → main`; **both admin and BA** review | admins + BA team configured in CODEOWNERS | GitHub branch protection requires both groups to review (enforced GitHub-side). Our matrix lets either click approve in Slack. |
| 3.5 | Reconcile against `dev` for a project that has both Asset and Credential entries | tenant connected; `manual` credential-source has the secret value stored | Asset of `ValueType=Credential` is created with `CredentialUsername`/`CredentialPassword` from the credential-source. Secret never logged. |

### Exceptions

| # | Action | Pre-conditions | Expected error |
|---|---|---|---|
| 3.E1 | `/rpa apply demo-bot test` | tenant `test` `status=pending_credentials` | `TenantNotConnectedError`, code `reconcile.blocked_unconfigured_tenant`. |
| 3.E2 | `/rpa reconcile demo-bot prod` | dev caller without `ASSET_QUERY[prod]` | `PermissionDeniedError`. |
| 3.E3 | Reconcile encounters Orchestrator returning 401 | tenant connected; OAuth secret rotated outside the platform | TokenManager retries once; persistent 401 → `OrchestratorAuthError`. Row marked `auth_failed` (TODO: not yet wired in v1). |
| 3.E4 | Apply fails on the second create | first create OK, second throws 409 | Reconciler stops on first error. Outcomes record the failed step; `stoppedAt` is set; bucket-file upload is skipped. |
| 3.E5 | Caller's Orchestrator role grants only `Assets.View` | dev with read-only role | `requireCapability("reconcile.apply")` throws with `missing` listing `Assets.Create`, `Assets.Edit`, etc. |
| 3.E6 | `assets.json` declares an asset with `type=keyValueList` | tenant connected | Asset is included in the diff but reconciler maps `keyValueList`→`Text` (default branch in `assets.ts`). VERIFY against a live tenant — may need to add support. |

### Tiered delete policy (memory: `tiered_delete_policy`)

The reconciler's `allowDeletes` flag is computed by the `/reconcile/apply`
route from the `RECONCILE_DELETE` matrix grant. Both the matrix and the
caller's Orchestrator role's `*.Delete` capabilities must agree before a
delete actually executes.

| # | Caller role | Tenant | Diff has deletes | Expected outcome |
|---|---|---|---|---|
| 3.D1 | developer | dev | yes | Deletes apply (matrix grants RECONCILE_DELETE on dev). Orchestrator role must include the four `*.Delete` caps; if not, `requireCapability("reconcile.apply_with_deletes")` rejects with `details.missing`. |
| 3.D2 | developer | test | yes | `allowDeletes=false`. Deletes appear in `outcomes` as `status=skipped`, audit reason `caller_lacks_delete_permission_or_prod_locked`. Creates/updates still apply. |
| 3.D3 | admin | test | yes | Deletes apply. |
| 3.D4 | admin | stage | yes | Deletes apply. |
| 3.D5 | admin | prod | yes | `allowDeletes=false` (prod is intentionally absent from every role's grant). Deletes skipped, audit reason recorded. Creates/updates still apply. |
| 3.D6 | ba | stage | yes | Deletes apply. |
| 3.D7 | ba | test | yes | `allowDeletes=false`. Skipped. |
| 3.D8 | ba | prod | yes | `allowDeletes=false`. Skipped — Orchestrator UI is the only delete path for prod. |
| 3.D9 | admin with Developer Orchestrator role (no `*.Delete` caps) | dev | yes | Matrix says yes but Orchestrator role doesn't cover `Assets.Delete` etc. → `requireCapability` throws `permission_denied`, `details.missing` lists the missing caps. **No deletes attempted, no creates attempted** — the preflight fails the entire apply before any wire call. |

---

## 4. Identity resolution (Slack → Orchestrator)

### Requirements

| # | Slack email | Orchestrator state | Expected resolution |
|---|---|---|---|
| 4.1 | `alice@harvard.edu` | User exists with same email | Exact match; resolver returns `orchestratorUserId`, role names. |
| 4.2 | `alice.smith@hms.harvard.edu` | User has `Name=Alice, Surname=Smith, EmailAddress=asmith@partners.org` | Fuzzy match — domain contains "harvard" AND local-part contains first name. |
| 4.3 | `smith.alice@harvard.edu` | as 4.2 | Fuzzy match by surname. |

### Exceptions

| # | Slack email | Orchestrator state | Expected |
|---|---|---|---|
| 4.E1 | `alice@gmail.com` | Any | `resolveBySlackEmail` returns `undefined`. Domain rule fails. |
| 4.E2 | `xyz@harvard.edu` | No user has Name or Surname containing "xyz" | `undefined`. Caller gets `PermissionDeniedError(reason=no_orchestrator_identity)`. |
| 4.E3 | `alice@harvard.edu` | Two users (Alice Smith and Alice Jones) | First match returned; `onAmbiguous` callback fires (logged); admin should clean up the duplicate name. |
| 4.E4 | `b@harvard.edu` | User Name="A", Surname="B" | `undefined`. Single-character names rejected by the ≥2-char guard. |

---

## 5. Permissions matrix (§7 + delete policy) round-trip

### Requirements

| # | Role | Permission | Tenant context | Expected `can()` |
|---|---|---|---|---|
| 5.1 | developer | `CONFIG_QUICK_EDIT` | dev | true |
| 5.2 | developer | `CONFIG_QUICK_EDIT` | test | false |
| 5.3 | admin | `PR_APPROVE_DEV_TO_TEST` | n/a | true |
| 5.4 | admin | `PR_APPROVE_STAGE_TO_PROD` | n/a | true (added 2026-05-03) |
| 5.5 | ba | `PR_APPROVE_TEST_TO_STAGE` | n/a | true (added 2026-05-03) |
| 5.6 | ba | `PR_APPROVE_DEV_TO_TEST` | n/a | false |
| 5.7 | admin | `ROLE_ASSIGN` | n/a | true |
| 5.8 | developer / ba | `ROLE_ASSIGN` | n/a | false |
| 5.9 | developer | `RECONCILE_DELETE` | dev | true |
| 5.10 | developer | `RECONCILE_DELETE` | test/stage/prod | false |
| 5.11 | admin | `RECONCILE_DELETE` | dev/test/stage | true |
| 5.12 | admin | `RECONCILE_DELETE` | prod | **false** (Orchestrator UI only) |
| 5.13 | ba | `RECONCILE_DELETE` | stage | true |
| 5.14 | ba | `RECONCILE_DELETE` | dev/test/prod | false |

### Exceptions

| # | Setup | Expected |
|---|---|---|
| 5.E1 | `can(user, ASSET_QUERY)` with no tenant context | false (conservative deny — tenant-scoped grants demand a tenant). |
| 5.E2 | `can(user, INVALID_KEY)` | TS compile error — permission keys are a closed enum. |

---

## 6. Audit log

### Requirements

| # | Action | Expected `audit_log` row |
|---|---|---|
| 6.1 | Successful reconcile apply (asset created) | `action=create.asset`, `success=true`, `transport=rest_fallback`, `correlation_id` set, `actor_user_id` populated when caller resolved. |
| 6.2 | Skipped delete during reconcile | `action=delete.asset`, `success=true` (skip is not a failure), `after.reason=platform_does_not_delete`. |
| 6.3 | Failed apply step | `action=create.asset`, `success=false`, `error` non-null. |
| 6.4 | Tenant connect | `action=tenant.connect.tenant`, `success=true` on successful validation. |

### Exceptions

| # | Setup | Expected |
|---|---|---|
| 6.E1 | DB write to `audit_log` fails | The platform should NOT swallow this — let it propagate. (TODO: confirm fail-fast vs degrade-gracefully decision.) |
| 6.E2 | An unknown system event with no actor | `actor_user_id` is null; the row is still inserted. |

---

## 7. Branch / approval flow (GitHub side)

### Requirements

| # | Branch transition | Required approver(s) — matrix | Required approver(s) — GitHub branch protection |
|---|---|---|---|
| 7.1 | feature/* → dev | Developer can self-merge per GitHub config | At least 1 from devs (CODEOWNERS) |
| 7.2 | dev → test | admin (matrix) | At least 1 from admins |
| 7.3 | test → stage | admin OR BA (matrix) | Combination — at least 1 admin AND at least 1 BA per CODEOWNERS rule |
| 7.4 | stage → main | admin OR BA (matrix) | Same combination |

### Exceptions

| # | Setup | Expected |
|---|---|---|
| 7.E1 | Developer attempts to merge `dev → test` directly via Git push | GitHub branch protection rejects — required reviewers absent. |
| 7.E2 | Admin clicks Slack-side approve but is missing Orchestrator capability | `requireCapability` rejects before the API touches Orchestrator. |
| 7.E3 | BA approves test→stage but no admin has approved | GitHub waits for the second approval; merge is blocked. |

---

## 8. Slack channel scoping

### Requirements

| # | Action | Pre-conditions | Expected |
|---|---|---|---|
| 8.1 | `/rpa help` in `#rpa-platform` channel | `RPA_SLACK_CHANNEL_ID=<id-of-rpa-platform>` | Bot responds normally. |
| 8.2 | `/rpa help` in some other channel | Same | Bot replies ephemerally with a pointer to `<#RPA_SLACK_CHANNEL_ID>`. |
| 8.3 | `/rpa help` anywhere | `RPA_SLACK_CHANNEL_ID` not set | Bot responds normally (unrestricted). |

### Exceptions

| # | Setup | Expected |
|---|---|---|
| 8.E1 | `RPA_SLACK_CHANNEL_ID` set to a channel the bot isn't in | Bot still rejects commands outside that ID, but the user can't `<#…>` link cleanly. Fix: invite the bot to that channel during setup. |

---

## 9. Smoke checklist before each release

These are the sanity checks to run end-to-end with the docker-compose stack
plus a real (or mock) Orchestrator.

1. `docker compose up -d --build` brings up postgres, mock-orchestrator-mcp, api, slack-bot.
2. `pnpm --filter @rpa-platform/db db:migrate` applies schema.
3. `pnpm seed` succeeds — three roles, two framework releases, one demo project.
4. `/rpa help` in Slack returns the help message.
5. `/rpa new smoke-bot "smoke" owners=admin@harvard.edu` creates a repo (or returns the next-step hint if no template token configured).
6. `/rpa tenant connect smoke-bot dev client_id=… client_secret=… folder=1 identity_token_url=…` returns `status: connected`.
7. `pnpm sim:commit dev` posts a dry-run reconcile that returns 0 creates / 0 updates / N skipped-deletes for the smoke-bot project.
8. `pnpm test` from the repo root reports `0 failed`.
9. Audit log has rows for steps 5–7 with non-null `correlation_id`.

If any of these fail, do NOT cut a release.
