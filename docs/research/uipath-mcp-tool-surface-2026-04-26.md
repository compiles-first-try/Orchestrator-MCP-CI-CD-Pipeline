# UiPath MCP tool surface for Orchestrator resource management

- **Verified on:** 2026-04-26
- **Researcher:** Claude (uipath-research skill)
- **Build context:** `packages/orchestrator-client` (spec §10.5 — MCP-primary, REST-fallback per Orchestrator op)

## TL;DR

The spec assumes UiPath Cloud's MCP server exposes Orchestrator's
resource-management surface (Assets, Queues, Buckets, Bucket files,
Credentials) as MCP tools we can discover at startup and call directly,
with REST as a fallback. **As of April 2026, this assumption does not
hold.** UiPath's MCP servers are designed to expose UiPath *artifacts*
(Automations, Agents, Agentic Processes, API Workflows, Integration
Service Activities) as invoke-style tools — they do not expose CRUD
operations on Orchestrator resources. For everything `rpa-platform`
needs to do (create assets, define queues, manage buckets, upload bucket
files, register credentials), there is no MCP tool surface today;
**REST/OData is the only path**. This is a material conflict with §10.5
that needs a user decision before `orchestrator-client` is built.

## Findings

### UiPath MCP server taxonomy

UiPath Cloud Orchestrator supports four MCP server *types*, all of
which are *outbound* — they let UiPath expose its own surface to
external MCP clients (e.g., AI agents). They are not a generic
"Orchestrator REST translated to MCP" wrapper.

- The four server types are **UiPath, Coded, Command, Remote**.
  ([Orchestrator — About MCP Servers](https://docs.uipath.com/orchestrator/automation-cloud/latest/user-guide/about-mcp-servers), accessed 2026-04-26)
- The **UiPath** type "Exposes UiPath artifacts as tools via MCP."
  ([Orchestrator — About MCP Servers](https://docs.uipath.com/orchestrator/automation-cloud/latest/user-guide/about-mcp-servers), accessed 2026-04-26)
- The **Coded** type hosts a custom-coded MCP server (i.e., user code
  inside UiPath). **Command** brings an external MCP server in via a
  package feed. **Remote** proxies requests to an MCP server outside
  UiPath. None of these expose Orchestrator's resource-management API
  by default. ([Orchestrator — About MCP Servers](https://docs.uipath.com/orchestrator/automation-cloud/latest/user-guide/about-mcp-servers), accessed 2026-04-26)

### What categories of tool a UiPath MCP server can expose

The artifact categories that can be added as tools to a UiPath-type MCP
server are:

- **Automations** — RPA workflow processes
- **Agents** — agent packages
- **Agentic Processes** — packages from Maestro
- **API Workflows** — API workflow processes
- **Activities** — Integration Service activities

([Orchestrator — Creating UiPath MCP Servers](https://docs.uipath.com/orchestrator/automation-cloud/latest/user-guide/creating-uipath-mcp-servers), accessed 2026-04-26)

These are **invoke-style** tools (run a process, call an integration
activity). None of these categories cover "create an Asset," "define a
Queue," "create a Bucket," "upload a Bucket file," or "register a
Credential."

A community/third-party MCP server listing (LobeHub) describes a
"UiPath MCP server" that "exposes orchestration capabilities as tools so
assistants can query queues, inspect jobs, start automations, and
retrieve logs." This is **read-only**, scoped to a different listing,
and not the official UiPath MCP server type. ([LobeHub — UiPath MCP Server](https://lobehub.com/mcp/uipath-uipath_mcp), accessed 2026-04-26 — community source, treat as a hint only)

### REST/OData is the supported path for resource management

All resource-management operations the platform needs are OData-only:

- **Assets**: `GET/POST/PUT/DELETE /odata/Assets`. POST body includes
  `Name`, `ValueScope`, `ValueType`, `StringValue`/`IntValue`/etc.
  ([Orchestrator — Assets requests](https://docs.uipath.com/orchestrator/standalone/2022.10/api-Guide/assets-requests), accessed 2026-04-26)
- **Queue definitions**: `POST {orchestratorUrl}/odata/QueueDefinitions`
  with `Name`, `Description`, `MaxNumberOfRetries`,
  `AcceptAutomaticallyRetry`, `ArchiveItems`. The doc explicitly
  separates `QueueDefinitions` (for external systems via API) from
  `Queues` (for the Robot to access queues at runtime). ([Orchestrator — About OData and references](https://docs.uipath.com/orchestrator/automation-cloud/latest/api-Guide/about-odata-and-references) and forum confirmations [1](https://forum.uipath.com/t/cant-create-a-queue-definition-through-the-orchestrator-rest-api/13608) [2](https://forum.uipath.com/t/orchestrator-http-request-call-odata-queuedefinitions/37132), all accessed 2026-04-26)
- **Storage buckets**: managed via the buckets requests page; bucket
  *file* upload is a **two-step** flow:
  1. `GET /odata/Buckets({key})/UiPath.Server.Configuration.OData.GetWriteUri?path=...&contentType=...`
     returns a pre-signed URI plus the HTTP method to use.
  2. The client then PUTs the file binary to that pre-signed URI.

  The scope required is `OR.Administration`. ([Orchestrator — Storage bucket requests](https://docs.uipath.com/orchestrator/automation-cloud/latest/api-guide/storage-bucket-requests), accessed 2026-04-26)
- **Credentials**: managed via the credential-store plugin / Asset API
  combination. Credentials are stored in a credential store and the
  Asset API exposes them at the asset boundary. ([Orchestrator — Managing credential stores](https://docs.uipath.com/orchestrator/automation-cloud/latest/user-guide/managing-credential-stores), accessed 2026-04-26)

### OAuth2 External Application scope naming

The spec (§0 invariant 6) names "OAuth2 client credentials" as the only
auth method. Confirmed and refined:

- Scopes use the **`OR.<Resource>[.<Access>]`** convention, **not**
  `Orchestrator.<Resource>` as some older docs imply. Examples that
  surfaced: `OR.Machines`, `OR.Machines.Read`, `OR.Administration`.
  ([Automation Cloud — External Applications (OAuth)](https://docs.uipath.com/automation-cloud/automation-cloud/latest/api-guide/accessing-uipath-resources-using-external-applications), accessed 2026-04-26)
- Bucket-file upload requires `OR.Administration`. ([Orchestrator — Storage bucket requests](https://docs.uipath.com/orchestrator/automation-cloud/latest/api-guide/storage-bucket-requests), accessed 2026-04-26)
- For confidential apps with **fine-grained access** configured at the
  Orchestrator level (folder/tenant-scoped permissions), the app should
  request `OR.Default` and Orchestrator gates the actual resources at
  call time. ([Automation Cloud — External Applications (OAuth)](https://docs.uipath.com/automation-cloud/automation-cloud/latest/api-guide/accessing-uipath-resources-using-external-applications), accessed 2026-04-26)
- Client credentials flow does **not** issue refresh tokens — tokens
  are short-lived and re-requested on expiry. (Same source.)

This last point is consistent with the spec §0 invariant 6 ("tokens
cached, refreshed at 80% of expires_in") — "refreshed" here means
"re-fetched via a fresh client-credentials grant," not OAuth refresh
tokens. Worth being explicit about that in the token manager so the
implementation doesn't try to use a non-existent refresh-token flow.

## Implications for `rpa-platform`

### 1. `packages/orchestrator-client` MCP-primary model is unsupported (spec conflict — needs user decision)

**Spec §0 invariant 5 + §10.5** describe an MCP-primary client with
REST as the per-operation fallback, recording `transport=mcp` or
`transport=rest_fallback` per audit row. **Reality:** for the resource
operations `rpa-platform` performs, there are *no* MCP tools to
discover. Discovery would return zero matching tools and every call
would be REST.

**Three options for the user to pick from:**

a. **Drop the MCP layer.** Make `orchestrator-client` REST-only.
   `audit_transport` enum simplifies to `rest` / `n_a`. Cleaner code,
   honest about the surface UiPath actually offers.
b. **Keep MCP discovery as scaffolding** but treat REST as the primary
   transport for resource ops. The MCP path remains a placeholder for
   the future where UiPath might expose resource-CRUD MCP tools (or
   where we run our own custom Coded MCP server in front of
   Orchestrator). The audit row records `mcp` if the discovered tool
   set actually contains a match (currently never), `rest_fallback`
   otherwise.
c. **Roll our own MCP wrapper.** Build a Coded UiPath MCP server that
   exposes our resource ops as MCP tools, then connect to it. Probably
   overkill for v1 but worth flagging.

My recommendation: **(b)**. It preserves the spec's audit/transport
invariant, keeps the door open without speculative work, and
accurately describes what's happening today. The discovery code is
small and the keep-it-honest cost (one extra branch in each operation)
is low.

### 2. Bucket-file upload genuinely requires the two-step REST flow

The handoff prompt asked specifically: *"whether bucket file upload
still requires REST fallback."* Answer: **yes, REST is the only
option**, and the operation is two-step (`GetWriteUri` → PUT to the
returned URI). The token used in step 2 is the **pre-signed URI's own
auth**, not the Orchestrator OAuth token, so the HTTP client must not
attach the bearer token to the upload request. This is a useful
implementation note for `orchestrator-client`'s bucket adapter.

### 3. OAuth scope choice is project-wide

Because of fine-grained access support, **the simplest and safest
configuration is `OR.Default`** on each tenant's External App, with
folder-level permissions configured in the Orchestrator UI. This
matches the spec invariant ("one External App per tenant, registered
in Orchestrator Admin UI as a prerequisite"). The token manager just
requests `OR.Default` and lets Orchestrator gate per-call.

If finer-grained scopes are preferred for defense-in-depth, the set
needed for v1 reconcile is:

- `OR.Assets` (Asset CRUD)
- `OR.Queues` (Queue definitions, queue items)
- `OR.Administration` (Bucket file upload)
- `OR.Folders.Read` (resolve folder IDs)

These are inferred from the resource→scope mapping pattern; the exact
strings should be **verified per endpoint** in the UiPath
permissions-per-endpoint doc when wiring each operation.

### 4. Credential management has a UiPath-side wrinkle

Credentials live in a *credential store* in Orchestrator (cloud-hosted
or external plugin). The platform's `credentials.json` defines the
*name + kind*; the actual secret is set via the Asset API as a
credential-typed asset. This means our `credential-source` package's
"manual" path writes the user-supplied secret through the Asset POST,
not through a separate Credentials endpoint. The schema we built in
`config-schema` is compatible with this; the only adjustment needed
when wiring `orchestrator-client` is to map our `kind` field
(`username-password` / `api-key` / `oauth-token`) to UiPath's
credential-store representation (which generally only supports
username+password natively — API keys and OAuth tokens are stored as
the `username` slot or as text assets per convention).

## Open questions

- **Is there a permissions-per-endpoint doc with the canonical
  scope-string list?** The search surfaced a docs page titled
  "Permissions per endpoint" but `docs.uipath.com` blocks WebFetch
  (HTTP 403), so I could not capture the table. Verification path:
  open `https://docs.uipath.com/orchestrator/automation-cloud/latest/api-guide/permissions-per-endpoint`
  in a browser and dump the table for Assets, QueueDefinitions, Buckets,
  Bucket files, and Credentials into `docs/research/uipath-scopes-table-{date}.md`.
- **Does Orchestrator's MCP server, when configured with the right
  Activities tools, expose a path for runtime queue-item posting?**
  This is a separate concern from resource management — relevant only
  if we ever want to enqueue work via MCP from the Slack bot. Not on
  the v1 critical path.
- **Are there rate limits on `GetWriteUri` we need to back off
  against?** Not surfaced in public docs. Verification path: empirical
  testing during integration with a real tenant; not blocking v1.
- **Confirm that `OR.Default` + folder-scoped fine-grained permissions
  is the recommended pattern for "service account per tenant."** The
  External Applications doc strongly suggests yes, but a UiPath staff
  forum post or KB article would be the canonical citation.

## Sources

| URL | Title | Accessed | Notes |
| --- | ----- | -------- | ----- |
| https://docs.uipath.com/orchestrator/automation-cloud/latest/user-guide/about-mcp-servers | Orchestrator — About MCP Servers | 2026-04-26 | Authoritative on the four MCP server types |
| https://docs.uipath.com/orchestrator/automation-cloud/latest/user-guide/creating-uipath-mcp-servers | Orchestrator — Creating UiPath MCP Servers | 2026-04-26 | Authoritative on tool categories (Automations/Agents/Agentic/API workflows/Activities) |
| https://docs.uipath.com/orchestrator/automation-cloud/latest/user-guide/managing-mcp-servers | Orchestrator — Managing MCP Servers | 2026-04-26 | Lifecycle / hosting context |
| https://docs.uipath.com/orchestrator/automation-cloud/latest/user-guide/creating-coded-mcp-servers | Orchestrator — Creating Coded MCP Servers | 2026-04-26 | Path for option (c) above |
| https://docs.uipath.com/automation-cloud/automation-cloud/latest/api-guide/accessing-uipath-resources-using-external-applications | Automation Cloud — External Applications (OAuth) | 2026-04-26 | OR.X scope convention, OR.Default, no refresh-token flow |
| https://docs.uipath.com/orchestrator/automation-cloud/latest/api-guide/storage-bucket-requests | Orchestrator — Storage bucket requests | 2026-04-26 | Two-step bucket file upload, OR.Administration scope |
| https://docs.uipath.com/orchestrator/standalone/2022.10/api-Guide/assets-requests | Orchestrator — Assets requests | 2026-04-26 | /odata/Assets verbs, ValueType discriminator |
| https://docs.uipath.com/orchestrator/automation-cloud/latest/api-Guide/about-odata-and-references | Orchestrator — About OData and references | 2026-04-26 | OData base for Orchestrator REST |
| https://docs.uipath.com/orchestrator/automation-cloud/latest/api-guide/permissions-per-endpoint | Orchestrator — Permissions per endpoint | 2026-04-26 | Title surfaced in search; page not fetchable from this environment |
| https://docs.uipath.com/orchestrator/automation-cloud/latest/user-guide/managing-credential-stores | Orchestrator — Managing credential stores | 2026-04-26 | Credential store + Asset API combination |
| https://forum.uipath.com/t/cant-create-a-queue-definition-through-the-orchestrator-rest-api/13608 | Forum: creating queue definitions via REST | 2026-04-26 | Community confirmation of QueueDefinitions vs Queues split |
| https://forum.uipath.com/t/orchestrator-http-request-call-odata-queuedefinitions/37132 | Forum: odata/QueueDefinitions usage | 2026-04-26 | Community example of POST body |
| https://lobehub.com/mcp/uipath-uipath_mcp | LobeHub — UiPath MCP Server listing | 2026-04-26 | Third-party listing; treat as hint only |
