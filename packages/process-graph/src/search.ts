import type { ProcessGraph, SearchEntry } from "./types.js";

type SearchableGraph = Omit<ProcessGraph, "search" | "meta">;

// ---------------------------------------------------------------------------
// Flat, pre-tokenised index so the viewer can answer "find every place this
// file / table / variable / endpoint appears" without walking the whole graph.
// Large automations are searched, not rendered wholesale — this is what makes
// that possible.
// ---------------------------------------------------------------------------

export function buildSearchIndex(graph: SearchableGraph): SearchEntry[] {
  const entries: SearchEntry[] = [];

  for (const wf of graph.workflows) {
    entries.push(
      entry(wf.id, "workflow", wf.name, wf.annotation, [wf.name, wf.path, "xaml", "workflow"]),
    );
  }
  for (const system of graph.systems) {
    entries.push(
      entry(system.id, "system", system.name, system.kind, [system.name, system.kind, "system"]),
    );
    for (const surface of system.surfaces) {
      entries.push(
        entry(surface.id, "surface", surface.label, surface.detail, [
          surface.label,
          surface.kind,
          surface.detail ?? "",
          system.name,
        ]),
      );
    }
  }
  for (const d of graph.data) {
    entries.push(
      entry(d.id, "data", d.name, `${d.kind} : ${d.dataType}`, [
        d.name,
        d.dataType,
        d.kind,
        d.value ?? "",
        d.direction ?? "",
      ]),
    );
  }
  for (const decision of graph.decisions) {
    entries.push(
      entry(decision.id, "decision", decision.label, decision.condition, [
        decision.label,
        decision.kind,
        decision.condition ?? "",
        "decision",
      ]),
    );
  }
  for (const txn of graph.transactions) {
    entries.push(
      entry(txn.id, "transaction", txn.label, txn.op, [txn.label, txn.op, "transaction"]),
    );
  }
  for (const pathway of graph.pathways) {
    entries.push(
      entry(pathway.id, "pathway", pathway.label, pathway.kind, [
        pathway.label,
        pathway.kind,
        "pathway",
        "scenario",
      ]),
    );
  }
  return entries;
}

function entry(
  id: string,
  kind: SearchEntry["kind"],
  label: string,
  detail: string | undefined,
  rawTerms: readonly string[],
): SearchEntry {
  const terms = new Set<string>();
  for (const raw of rawTerms) {
    for (const token of tokenize(raw)) terms.add(token);
  }
  return { id, kind, label, detail: detail === "" ? undefined : detail, terms: [...terms] };
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((t) => t.length > 0);
}
