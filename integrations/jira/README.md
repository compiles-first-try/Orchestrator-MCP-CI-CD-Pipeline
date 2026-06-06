# Jira Integration (v2)

> **Status: Placeholder** — interfaces defined, implementation deferred to v2.

## Planned features

1. **Auto-create tickets on commit**: When a developer pushes code, create a Jira story with commit message, XAML files affected, and metadata
2. **Deployment tracking**: Update tickets as code moves through tenants (dev → test → stage → prod)
3. **PR linkage**: Link Jira tickets to GitHub PRs
4. **XAML change analysis**: Parse XAML diffs to describe what changed in human-readable terms

## Workflow

```
Developer pushes code
       │
       ▼
GitHub Action triggers
       │
       ├──▶ Deploy to Orchestrator (existing)
       │
       └──▶ Jira: Create/update ticket
              │
              ├── Summary: commit message
              ├── Description: files changed, XAML analysis
              ├── Labels: tenant, project, department
              └── Link: PR URL, deployment correlation ID
```

## Ticket format (proposed)

```
Summary: [RPA] Update FoodPro Invoice Processing - fix retry logic
Type: Task
Labels: rpa, campus-services, foodpro
Description:
  Branch: dev
  Commit: abc1234
  Author: developer@example.com

  Files changed:
  - FoodProInvoiceProcessing/Main.xaml (modified)
  - FoodProInvoiceProcessing/ProcessInvoice.xaml (modified)
  - Config/assets.json (modified)

  Deployment: Dev tenant — 2 assets updated, 1 package uploaded
```

## Files

- `src/jira.ts` — Interface definitions for `JiraIntegration`, `CommitInfo`, `DeploymentInfo`

## Prerequisites

- [ ] Jira Cloud instance URL and project key
- [ ] API token or OAuth app registration
- [ ] Decide ticket granularity: per-commit, per-PR, or per-deployment
- [ ] Map Jira issue types and workflow statuses
- [ ] Add `jira.js` or direct REST client to dependencies
