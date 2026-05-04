# UiPath documentation index

Curated list of canonical UiPath documentation URLs. Treat this file as the
starting source list for any UiPath-facing research; prefer it over searching
docs.uipath.com from scratch.

When researching with the `/uipath-research` skill, append discovered URLs
here rather than only citing them inside dated research notes — this keeps
the index from going stale.

## MCP (Model Context Protocol)

| Topic | URL |
| --- | --- |
| About MCP servers | https://docs.uipath.com/orchestrator/automation-cloud/latest/user-guide/about-mcp-servers |
| Managing MCP servers | https://docs.uipath.com/orchestrator/automation-cloud/latest/user-guide/managing-mcp-servers |
| Creating UiPath MCP servers | https://docs.uipath.com/orchestrator/automation-cloud/latest/user-guide/creating-uipath-mcp-servers |
| Creating a remote MCP server | https://docs.uipath.com/orchestrator/automation-cloud/latest/user-guide/creating-a-remote-mcp-server |
| MCP compliance guidelines | https://docs.uipath.com/orchestrator/automation-cloud/latest/user-guide/mcp-compliance-guidelines |

## Orchestrator API (REST / OData)

| Topic | URL |
| --- | --- |
| About OData and references | https://docs.uipath.com/orchestrator/automation-cloud/latest/api-GuidE/about-odata-and-references |
| OData v4 spec (OASIS, external) | https://docs.oasis-open.org/odata/odata/v4.0/errata03/os/complete/part1-protocol/odata-v4.0-errata03-os-part1-protocol-complete.html |
| Enumerated types | https://docs.uipath.com/orchestrator/automation-cloud/latest/api-Guide/enumerated-types |
| Building API requests | https://docs.uipath.com/orchestrator/automation-cloud/latest/api-guidE/building-api-requests |
| Permissions per endpoint | https://docs.uipath.com/orchestrator/automation-cloud/latest/api-Guide/permissions-per-endpoint |
| Response codes | https://docs.uipath.com/orchestrator/automation-cloud/latest/api-guide/response-codes |
| Rate limits | https://docs.uipath.com/orchestrator/automation-cloud/latest/api-Guide/rate-limits |

## Authentication

| Topic | URL |
| --- | --- |
| Authentication methods (overview) | https://docs.uipath.com/automation-cloud/automation-cloud/latest/api-guide/authentication-methods |
| External applications (OAuth2 client credentials — our chosen method) | https://docs.uipath.com/automation-cloud/automation-cloud/latest/api-guide/accessing-uipath-resources-using-external-applications |
| Managing external applications (admin guide — registration, scope picker) | https://docs.uipath.com/automation-cloud/automation-cloud/latest/admin-guide/managing-external-applications |
| Personal access tokens | https://docs.uipath.com/automation-cloud/automation-cloud/latest/api-guide/personal-access-tokens |
| Using PATs for API auth | https://docs.uipath.com/automation-cloud/automation-cloud/latest/api-guide/using-personal-access-tokens-for-api-authentication |

## Notes on URLs

- Capitalisation in URL paths (`api-GuidE`, `api-Guide`) is preserved as the
  user provided them. UiPath's docs site is case-insensitive in practice but
  cite the exact form when fetching.
- All URLs above are for **UiPath Automation Cloud** (the spec's default).
  On-prem and standalone install differences are out of scope for v1.

## Research notes derived from this index

| Date | Topic | File |
| --- | --- | --- |
| 2026-05-02 | MCP and REST surface for Orchestrator data-plane operations | [uipath-mcp-orchestrator-surface-2026-05-02.md](./uipath-mcp-orchestrator-surface-2026-05-02.md) |

## How to extend this index

When you discover an additional canonical URL during research:

1. Add it to the appropriate section (or create a new section) in this file.
2. Use a one-line description in the "Topic" column — not a sentence.
3. Commit alongside the research note that surfaced it.
