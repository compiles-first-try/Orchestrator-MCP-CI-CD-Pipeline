# process-viz — 3D map of a UiPath automation

Ingests a UiPath project (a directory of `.xaml`, or a `.nupkg` package) and
renders an **interactive 3D map** of the process, built for two jobs:

1. **Root-cause / debugging** — see every system the bot touches, follow the
   pipe for the exact scenario that failed (business exception vs system
   exception vs a specific decision branch), and read the steps in order.
2. **Confidence / sign-off** — show a business owner that the automation does
   what the requirements say: the systems, the areas within them (the login
   page, the ledger table, the invoices worksheet), the decisions, and the
   defined business/technical exception paths.

## The metaphor

| In the map              | Is a…                                                            |
| ----------------------- | ---------------------------------------------------------------- |
| **Building**            | System / application (browser, database, Excel, email, queue, …) |
| **Building height**     | How much of the automation runs against that system              |
| **Bands on a building** | Distinct areas/surfaces touched (login page, a table, a sheet…)  |
| **Glowing pipe**        | One scenario/pathway (colour-coded by kind)                      |
| **Central node**        | The process entry point                                          |

Because a large automation would clutter the screen if every scenario were
drawn at once, the map **filters by scenario** (toggle happy-path / business
exception / system exception / retry / decision branches) and has a **search**
box over every system, surface, file, table, endpoint, variable, decision and
transaction in the process. Click any building or pipe to open the inspector.

## Usage

```sh
# from the repo root
pnpm --filter @rpa-platform/process-viz build

# directory or .nupkg → out/process-graph.json + out/process-map.html
node tools/process-viz/dist/cli.js ./path/to/uipath-project --out ./out
# or, without building:
pnpm --filter @rpa-platform/process-viz exec tsx src/cli.ts /abs/path/to/project.nupkg --out /abs/out

open ./out/process-map.html   # any modern browser
```

Options: `--out <dir>` (default `process-viz-out`), `--json-only`, `--help`.

## Output

- **`process-graph.json`** — the full semantic model (see
  [`@rpa-platform/process-graph`](../../packages/process-graph)). Machine
  readable; diff it between releases, feed it to other tools.
- **`process-map.html`** — a single self-contained file. The graph and the 3D
  layout are embedded inline; only the Three.js runtime is pulled from a pinned
  CDN (`three@0.160.0`). For a fully offline map, vendor that one file and swap
  the `<script type="importmap">` reference.

## Notes

- The map is **static analysis** of XAML — it shows what the automation _is
  wired to do_, from declared attributes. It does not execute anything and reads
  no secrets. Values shown are XAML defaults, not runtime data.
- Selectors, URLs, SQL, file paths and queue names are mined from activity
  attributes. Details that live in nested XAML elements (some selectors) may not
  resolve to a named surface yet — those activities still attach to the correct
  building.
