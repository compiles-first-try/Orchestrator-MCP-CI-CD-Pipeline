# @rpa-platform/process-graph

Turns a UiPath automation (a repo of `.xaml`, or a `.nupkg`) into a **semantic
process model** — the concepts a person reasons about when debugging a bot or
proving it meets business requirements:

| Concept          | What it captures                                                                        | Rendered as  |
| ---------------- | --------------------------------------------------------------------------------------- | ------------ |
| **Systems**      | Every external system the bot touches (browser, DB, Excel, email, API, queue…)          | Buildings    |
| **Surfaces**     | The _area_ inside a system: login page, an app page, a DB table, a worksheet…           | Doors/floors |
| **Data**         | Arguments & variables with their declared types and default values                      | —            |
| **Decisions**    | If / Switch / Flow Decision / While / Retry, with condition + branch labels             | —            |
| **Transactions** | REFramework Get / Process / Set-status / Add-queue / Business-exception                 | —            |
| **Pathways**     | One route per scenario: happy path, business exception, system exception, retry, branch | Pipes        |
| **Workflows**    | The `.xaml` files themselves + the InvokeWorkflowFile call graph                        | —            |
| **Search index** | Pre-tokenised entries so large automations are _searched_, not rendered wholesale       | —            |

It is the data layer behind [`tools/process-viz`](../../tools/process-viz), but
has no dependency on any renderer — the `ProcessGraph` is reusable on its own
(dashboards, audits, docs, diffing two releases).

## Usage

```ts
import { ingestPath, buildProcessGraph } from "@rpa-platform/process-graph";

const ingested = await ingestPath("./my-uipath-project"); // dir OR a .nupkg
const graph = buildProcessGraph(ingested.sources, {
  name: ingested.name,
  source: ingested.source,
  entryPoint: ingested.entryPoint, // read from project.json when present
});

console.log(graph.systems, graph.pathways, graph.search);
```

## Design notes

- **Static only.** Surfaces are derived from _declared_ XAML attributes (a URL
  on `OpenBrowser`, a `SELECT ... FROM Ledger`, a `WorkbookPath`). Runtime
  values are not resolved — `graph.meta.generatedNote` says so, and the map is
  honest about it.
- **Scope-aware.** `OpenBrowser`, `Excel Application Scope`, `Database Connect`
  etc. establish an _ambient system_; the `Click` / `Type Into` activities
  beneath them inherit it, so a UI interaction is attributed to the right
  building instead of a generic "UI" bucket.
- **Deterministic.** Same input → identical graph. Ids come from names and
  document order, never from time or randomness.
- **Zero new runtime dependencies.** `.nupkg` (a ZIP) is read with a tiny
  built-in ZIP reader (`src/zip.ts`) over `node:zlib` — no archive library is
  added to the platform's fixed dependency set.

## Tests

```sh
pnpm --filter @rpa-platform/process-graph test
pnpm --filter @rpa-platform/process-graph test:coverage
```

A REFramework-style sample (`test/fixtures/refx-demo`) exercises browser login +
navigation, a ledger DB query, an Excel read, a decision, a raised business
exception, a system-exception catch, and the transaction verbs end to end.
