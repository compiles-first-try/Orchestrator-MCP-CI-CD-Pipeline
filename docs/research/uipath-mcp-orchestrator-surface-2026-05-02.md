# MCP and REST surface for Orchestrator data-plane operations

- **Verified on:** 2026-05-02
- **Researcher:** Claude (uipath-research skill)
- **Build context:** `packages/orchestrator-client` design — needs to know what's reachable via MCP vs. REST and which OAuth2 surface to drive.

## TL;DR

UiPath Orchestrator's MCP server is **purpose-built for invoking automations** (RPA workflows, agents, agentic processes, API workflows, Integration Service activities). It is **not a generic CRUD wrapper** for Assets, Queue Definitions, Buckets, Bucket files, or Credentials. The spec's invariant #5 — *"MCP-primary, REST-fallback for every Orchestrator op"* — does not match what UiPath actually exposes in 2026-04. For the reconciliation operations the platform performs (Asset/Queue/Bucket/Credential CRUD + bucket file write), **REST/OData over an OAuth2 External Application is the only available transport**. The MCP-primary pattern remains valid for any future "trigger automation from Slack" features, but is not applicable to v1's reconciler.

## Findings

### MCP server surface — what's exposable

The four MCP server *types* in Orchestrator (per the [About MCP servers](https://docs.uipath.com/orchestrator/automation-cloud/latest/user-guide/about-mcp-servers) page, last updated 2026-04-30):

- **UiPath** — "Expose UiPath artifacts as tools via MCP. You can build a UiPath MCP Server directly from the platform interface." ([source](https://docs.uipath.com/orchestrator/automation-cloud/latest/user-guide/about-mcp-servers), accessed 2026-05-02)
- **Coded (Preview)** — "Host a custom-coded MCP Server."
- **Command (Preview)** — "Bring an MCP Server from an external package feed via command."
- **Remote** — "Connect to remote MCP Servers outside UiPath via secure tunneling."

For the **UiPath** type — the only one that exposes Orchestrator-side artifacts as tools — the toolable artifacts are limited to ([Creating UiPath MCP servers](https://docs.uipath.com/orchestrator/automation-cloud/latest/user-guide/creating-uipath-mcp-servers), accessed 2026-05-02):

> Tools can include UiPath artifacts, such as:
> - **Automations:** includes processes defined from RPA workflows.
> - **Agents:** includes processes created from an agent package published from Agents.
> - **Agentic Processes:** includes processes created from an agentic process package published from Maestro.
> - **API Workflows:** includes processes defined from API workflows.
> - **Activities:** includes Integration Service activities.

**No mention of Assets, Queues, Buckets, Bucket files, or Credentials as toolable artifacts.** The MCP server's preview URL pattern is `https://cloud.uipath.com/<OrganizationName>/<TenantName>/agenthub_/mcp/<FolderID>/<MCPServerName>` — note `agenthub_`, not `orchestrator_`. ([Creating UiPath MCP servers](https://docs.uipath.com/orchestrator/automation-cloud/latest/user-guide/creating-uipath-mcp-servers))

The [MCP compliance guidelines](https://docs.uipath.com/orchestrator/automation-cloud/latest/user-guide/mcp-compliance-guidelines) (accessed 2026-05-02) describe encryption-in-transit/at-rest, agent-activity logging, and data-residency considerations for using MCP, but do not contradict or expand the artifact list above. They reaffirm: *"UiPath: where customers can directly use as tools other UiPath components, such as processes, API workflows, etc."*

**Loophole worth noting:** because **API Workflows** count as a toolable artifact, an admin *can* hand-build an API Workflow that wraps a REST call (e.g. "List Assets") and expose that as an MCP tool. That's a UiPath-Studio-side authoring task, not something the platform manages dynamically. v1 should not depend on it.

### External Application registration — confidential + Application Scopes

From [Managing external applications](https://docs.uipath.com/automation-cloud/automation-cloud/latest/admin-guide/managing-external-applications) (accessed 2026-05-02):

- **Two app types:** Confidential and Non-confidential. *"Non-confidential applications cannot access application scope."*
- **Two scope kinds:** *"User Scopes — the external application can access those resources within a user context and a user with the appropriate permissions must be logged in."* / *"Application Scopes — the external application has access to application-wide data for the selected scopes without the need for user interaction."*
- **Implication for the platform:** OAuth2 `client_credentials` is server-to-server and cannot involve an interactive user. We must register the External App as **Confidential** and request **Application Scopes** only. This aligns with the spec ("OAuth2 client credentials … is the only Orchestrator auth method").
- **Registration path:** Orchestrator (tenant level) → Manage Access → Manage Accounts and Groups → External Applications. One app per tenant per spec invariant #6.
- **Secret delivery:** the `client_secret` is shown **once** at app creation and is unretrievable if lost. Our flow:
  1. Admin registers the app, copies the secret.
  2. `/rpa tenant connect` Slack command takes the secret as input.
  3. Platform encrypts via AES-256-GCM and stores in `project_tenants.oauth_client_secret_encrypted`.
- **Redirect URL:** required only when User Scopes are selected. For our Application-Scope-only flow it is optional / not used.
- **Confirms identity gap:** because Application Scopes carry no user context, the Orchestrator wire call has no concept of "which Slack user triggered this". The platform must resolve `Slack user → Orchestrator user → roles` itself before issuing the call (per the permissions architecture decision).

### OAuth2 External Application — confirmed shape

From [Accessing UiPath resources using External Applications](https://docs.uipath.com/automation-cloud/automation-cloud/latest/api-guide/accessing-uipath-resources-using-external-applications) (accessed 2026-05-02):

- **Token endpoint:** `https://cloud.uipath.com/{organizationName}/identity_/connect/token`
- **Header:** `Content-Type: application/x-www-form-urlencoded`
- **Body:** `grant_type=client_credentials&client_id={app_id}&client_secret={app_secret}&scope={scopes}`
- **Response:**
  ```json
  {
    "access_token": "{access_token}",
    "expires_in": 3600,
    "token_type": "Bearer",
    "scope": "{scopes}"
  }
  ```
- **No refresh token.** *"The client credentials flow does not support refresh tokens."* Clients must reauthenticate.
- **Scopes are requested per token** — multiple scopes can be space-delimited in the `scope` parameter.

The doc explicitly mentions only a few scope examples by name (`OR.Machines.View`, `OR.Machines`, `OR.Robots`, `OR.Default`) and instructs the reader to *"check the endpoint in the API documentation of the resource to get the scope values you need"*. The full canonical OAuth scope list is not enumerated in this page.

### REST/OData surface — base URL and folder header

From [Building API requests](https://docs.uipath.com/orchestrator/automation-cloud/latest/api-guide/building-api-requests) (accessed 2026-05-02):

- **Base URL:** `{AutomationCloudURL}/{organizationName}/{tenantName}/orchestrator_`
- All entity collections live under `/odata/{Entity}`. Confirmed example paths in the doc: `/odata/Environments`, `/odata/Processes`, `/odata/Jobs`, `/odata/QueueItems`. The `/odata/Assets`, `/odata/Buckets`, `/odata/QueueDefinitions` paths are referenced in the per-endpoint permissions doc (below) but their full CRUD signatures aren't on the API-requests overview.
- **Folder scoping** is mandatory for folder-resident resources. Each request must contain one of: `X-UIPATH-OrganizationUnitId`, `X-UIPATH-FolderPath-Encoded`, `X-UIPATH-FolderPath`, or `X-UIPATH-FolderKey`.

### Permissions per endpoint — role-permission names (not OAuth scopes)

From [Permissions per endpoint](https://docs.uipath.com/orchestrator/automation-cloud/latest/api-guide/permissions-per-endpoint) (accessed 2026-05-02):

| Endpoint | Required permission(s) |
| --- | --- |
| `GET /odata/Assets` | `Assets.View` |
| `POST /odata/Assets` | `Assets.Create` |
| `PUT /odata/Assets({Id})` | `Assets.Edit` |
| `DELETE /odata/Assets({Id})` | `Assets.Delete` |
| QueueDefinitions GET | `Queues.View` |
| QueueDefinitions POST/PUT | `Queues.Create` / `Queues.Edit` |
| QueueDefinitions DELETE | `Queues.Delete` |
| QueueItems GET | `Queues.View` & `Transactions.View` |
| `GET /odata/Buckets` | `Storage Buckets.View` |
| `POST /odata/Buckets` | `Storage Buckets.Create` |
| Bucket file ops | `Storage Buckets.View` & `Storage Files.{View|Create|Delete}` |
| Folders GET / mutation | `Folders.View` / `Folders.{Create,Edit,Delete}` (or `Subfolders.*`) |

**Caveat — these are Orchestrator role-permission names, not OAuth2 scopes.** OAuth2 scope names use the `OR.*` prefix (e.g. `OR.Machines.View` from the External Apps doc). The two namespaces map to each other but the docs do not provide a side-by-side table on this page. The orchestrator-client must translate "I need to call `POST /odata/Assets`" → "request OAuth2 scope `OR.Assets.Write` (or similar)". The exact `OR.*` scope strings need to be discovered at runtime or pulled from a more authoritative reference (Swagger/OpenAPI).

**Credentials/CredentialStores are not listed in the per-endpoint permissions table.** Credentials in Orchestrator are typically Assets of value type `Credential` — so they should be governed by `Assets.{View,Create,Edit,Delete}` and addressed via `/odata/Assets`. Credential Stores (CyberArk, Azure Key Vault) are a separate concept; their REST surface is not documented on the page I read.

### Enumerated types — partial confirmation

From [Enumerated types](https://docs.uipath.com/orchestrator/automation-cloud/latest/api-guide/enumerated-types) (accessed 2026-05-02):

- **Asset value type:** `Text (2)`, `Bool (3)`, `Integer (4)`, `Credential (5)`. **Not on the page:** `WindowsCredential`, `KeyValueList`, `DataTable`, `Array`. Our `packages/config-schema/src/assets.ts` lists `text | integer | bool | keyValueList`. The `keyValueList` value is a known UiPath asset type historically — not finding it on this page is most likely a doc gap rather than a removal — but worth verifying against a live tenant before relying on it.
- **QueueItem `ProcessingStatus`:** `New (0)`, `InProgress (1)`, `Failed (2)`, `Successful (3)`, `Abandoned (4)`, `Retried (5)`, `Deleted (6)`.
- **Job `JobState`:** `Pending (0)`, `Running (1)`, `Stopping (2)`, `Terminating (3)`, `Faulted (4)`, `Successful (5)`, `Stopped (6)`, `Suspended (7)`, `Resumed (8)`.
- **Storage bucket provider enum, process schedule status:** not on the page.

## Implications for rpa-platform

### 1. Spec invariant #5 needs revision

**The current spec text:** *"MCP-primary, REST-fallback for every Orchestrator op."*

**What's actually achievable in 2026-04:**

- **Data-plane CRUD** (Asset/Queue/Bucket/Credential read+write, bucket file upload) → **REST/OData only**. There is no built-in MCP tool for these. Building one requires admin-authored API Workflows in UiPath Studio, which v1 should not require.
- **Trigger-an-automation use cases** (e.g. *"From Slack, run automation X in tenant test"*) → **MCP-primary makes sense here** if v1 needs them. But the current spec scope (CLAUDE.md §"Scope discipline") explicitly excludes "Reconciliation of processes/jobs/triggers/folders/users", so v1 doesn't need to invoke automations either.

**Recommended revision:** drop "MCP-primary" for the reconciler. Use OAuth2-External-App + REST/OData for all v1 platform operations. Keep `orchestrator-client` extensible enough to add an MCP transport later if/when the user wants Slack-triggered automation runs, but don't pretend the MCP-fallback path exists for things UiPath doesn't expose as MCP tools.

**Decision needed from the user:** approve dropping MCP-primary from invariant #5 for v1's data-plane scope, OR direct me to design `orchestrator-client` with stub MCP tool names that admins must create as API Workflows in UiPath (which would push setup work onto every adopter and effectively break the demo workflow).

### 2. `orchestrator-client` architecture (assuming the revision above is approved)

- **One `OrchestratorClient` per tenant.** Holds an OAuth2 token manager (client_credentials flow against `https://cloud.uipath.com/{org}/identity_/connect/token`), a typed REST/OData client, and the per-call audit hook.
- **Token manager:**
  - Cache token in memory; refresh at 80% of `expires_in` (matches spec).
  - Never persist token to disk or logs.
  - On 401, refresh once and retry; on second 401, surface as auth error.
  - No refresh token (per UiPath docs — must reauthenticate fully).
- **REST client:**
  - Always sends folder header `X-UIPATH-OrganizationUnitId` (or `FolderKey`) for folder-resident resources.
  - Encodes errors as domain `RpaPlatformError` subclasses keyed by HTTP status (404 → `OrchestratorEntityNotFoundError`, 403 → `OrchestratorPermissionDeniedError`, etc.).
- **Per-call audit:** every call records `transport: "rest"` (since MCP is no longer in the picture for v1). Audit-row schema doesn't change; the `transport` enum just rarely sees `mcp` until automation-trigger features land.
- **Tool discovery removed from boot path.** No more "MCP tools/list at startup per tenant" — there are no MCP tools we depend on. If/when MCP is reintroduced, discovery becomes a per-feature concern, not boot-blocking.

### 3. Slack-user → Orchestrator-user resolution

OAuth2 External App = service principal. It does **not** carry a per-user identity. Per the permissions architecture decision (memory: Orchestrator owns roles), the platform must:

1. Map the Slack user to an Orchestrator user (likely by email match against `/odata/Users`).
2. Read that user's role assignments from Orchestrator.
3. Cache short-term (per-request or short TTL) to avoid hammering `/odata/Users`.

The OAuth2 External App scopes need `OR.Users.Read` (probable name; verify) and `OR.Roles.Read` to perform this resolution.

### 4. `OR.*` scope catalogue is unverified

The platform must request the right OAuth2 scopes per operation. The role-permission table (`Assets.View`, `Storage Buckets.Edit`, etc.) tells us what role permissions the *caller* needs but not the literal `OR.*` scope name to put in the token request body. Two paths to resolve:

- **Authoritative path:** pull UiPath's OpenAPI/Swagger spec from a live tenant and map endpoint-to-scope.
- **Pragmatic path:** start with conventional names (`OR.Assets`, `OR.Assets.Read`, `OR.Assets.Write`, `OR.Queues`, `OR.Queues.Read`, `OR.Queues.Write`, `OR.Storage`, `OR.Folders`, `OR.Users.Read`, `OR.Users.Write`) and validate at integration test time against a real tenant; fix names as 401/403 errors reveal them.

Until we have the user's tenant available for a live `tools/list` and a live OAuth2 negotiation, scope names go in code as `// VERIFY:` comments.

## Open questions

- **`OR.*` scope catalogue:** What are the canonical scope strings for `Assets.{View,Create,Edit,Delete}`, `Queues.*`, `Storage Buckets.*`, `Storage Files.*`, `Users.View`, `Roles.View`? **Verification path:** open Orchestrator Admin → Manage Access → Manage Accounts and Groups → External Applications → "Add" → Application Scope picker for the **Orchestrator API** resource. The dropdown is the canonical source — the docs do not enumerate it ([confirmed 2026-05-02 via the External Applications admin guide](https://docs.uipath.com/automation-cloud/automation-cloud/latest/admin-guide/managing-external-applications)). Fallback: hit a known endpoint without a scope and read the 403 to discover the required scope name.
- **Credentials vs Credential Stores:** Are project-level credentials addressable via `/odata/Assets` with `ValueType=Credential`, or via a separate `/odata/Credentials` collection? **Verification path:** call `GET /odata/$metadata` against a live tenant and grep for `Credentials` and `CredentialStores`.
- **Bucket file upload — REST-only:** confirmed that the documented flow is two-step REST (`GET /odata/Buckets({key})/UiPath.Server.Configuration.OData.GetWriteUri` → `PUT` to the returned signed URL). No MCP equivalent. We should design `orchestrator-client.uploadBucketFile()` against this two-step flow and not worry about an MCP shortcut.
- **Asset value type `KeyValueList`:** still supported? The Enumerated Types doc page only lists `Text/Bool/Integer/Credential`. **Verification path:** create a test asset with `ValueType=KeyValueList` against a live tenant; if rejected, remove from `packages/config-schema/src/assets.ts`.
- **MCP server access from the platform:** if v2 adds Slack-triggered automation runs, does the platform call `agenthub_/mcp/...` with the same OAuth2 External App token, or does it need a different auth path? **Verification path:** runtime — try a `tools/list` against the agenthub MCP URL with the same token and see what comes back.

## Sources

| URL | Title | Accessed | Notes |
| --- | --- | --- | --- |
| https://docs.uipath.com/orchestrator/automation-cloud/latest/user-guide/about-mcp-servers | About MCP servers | 2026-05-02 | Last updated 2026-04-30. Lists the four MCP server types and the artifact categories. |
| https://docs.uipath.com/orchestrator/automation-cloud/latest/user-guide/managing-mcp-servers | Managing MCP servers | 2026-05-02 | UI procedures only; no tool name examples. |
| https://docs.uipath.com/orchestrator/automation-cloud/latest/user-guide/creating-uipath-mcp-servers | Creating UiPath MCP servers | 2026-05-02 | Confirms the toolable artifact list and the agenthub URL pattern. |
| https://docs.uipath.com/orchestrator/automation-cloud/latest/user-guide/creating-a-remote-mcp-server | Creating a remote MCP server | 2026-05-02 | Custom URL + headers; auth via headers (often API key). |
| https://docs.uipath.com/orchestrator/automation-cloud/latest/user-guide/mcp-compliance-guidelines | MCP compliance guidelines | 2026-05-02 | Best-practices framing; reaffirms the artifact-only positioning of UiPath MCP. |
| https://docs.uipath.com/automation-cloud/automation-cloud/latest/api-guide/accessing-uipath-resources-using-external-applications | Accessing UiPath resources using External Applications | 2026-05-02 | Authoritative for OAuth2 client_credentials flow + token shape. |
| https://docs.uipath.com/automation-cloud/automation-cloud/latest/admin-guide/managing-external-applications | Managing external applications (admin guide) | 2026-05-02 | Confirms confidential vs non-confidential, Application vs User scopes, registration path. Scope strings are picked from a UI dropdown; not enumerated on the page. |
| https://docs.uipath.com/automation-cloud/automation-cloud/latest/api-guide/authentication-methods | Authentication methods | 2026-05-02 | High-level overview; doesn't enumerate scopes. |
| https://docs.uipath.com/orchestrator/automation-cloud/latest/api-guide/building-api-requests | Building API requests | 2026-05-02 | Base URL, folder headers. |
| https://docs.uipath.com/orchestrator/automation-cloud/latest/api-guide/permissions-per-endpoint | Permissions per endpoint | 2026-05-02 | Role-permission table; **not** OAuth scope names. |
| https://docs.uipath.com/orchestrator/automation-cloud/latest/api-guide/enumerated-types | Enumerated types | 2026-05-02 | Asset value type, QueueItem ProcessingStatus, JobState confirmed. |
