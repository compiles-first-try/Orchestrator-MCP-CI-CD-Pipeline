#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { buildProcessGraph, ingestPath } from "@rpa-platform/process-graph";
import { renderProcessMapHtml } from "./render-html.js";

// ---------------------------------------------------------------------------
// process-viz: ingest a UiPath project directory or .nupkg, build the semantic
// ProcessGraph, and emit both the machine-readable graph JSON and a
// self-contained interactive 3D map (HTML). No secrets, no network at build
// time — it only reads XAML.
// ---------------------------------------------------------------------------

interface CliArgs {
  readonly source: string;
  readonly outDir: string;
  readonly jsonOnly: boolean;
}

function parseArgs(argv: readonly string[]): CliArgs | undefined {
  const positional: string[] = [];
  let outDir = "process-viz-out";
  let jsonOnly = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--out" || arg === "-o") {
      const next = argv[i + 1];
      if (next === undefined) return undefined;
      outDir = next;
      i++;
    } else if (arg === "--json-only") {
      jsonOnly = true;
    } else if (arg === "--help" || arg === "-h") {
      return undefined;
    } else if (arg !== undefined) {
      positional.push(arg);
    }
  }
  if (positional.length !== 1 || positional[0] === undefined) return undefined;
  return { source: positional[0], outDir, jsonOnly };
}

const USAGE = `process-viz — 3D map of a UiPath automation

Usage:
  process-viz <project-dir | package.nupkg> [--out <dir>] [--json-only]

Options:
  -o, --out <dir>   Output directory (default: process-viz-out)
      --json-only   Emit process-graph.json only, skip the HTML map
  -h, --help        Show this help

Outputs:
  <out>/process-graph.json   The semantic process model
  <out>/process-map.html     Self-contained interactive 3D map (open in a browser)
`;

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args === undefined) {
    process.stdout.write(USAGE);
    process.exitCode = process.argv.length > 2 ? 1 : 0;
    return;
  }

  const source = resolve(args.source);
  process.stdout.write(`Ingesting ${source} …\n`);
  const ingested = await ingestPath(source);
  const graph = buildProcessGraph(ingested.sources, {
    name: ingested.name,
    source: ingested.source,
    ...(ingested.entryPoint !== undefined ? { entryPoint: ingested.entryPoint } : {}),
  });

  for (const warning of ingested.warnings) process.stdout.write(`  ! ${warning}\n`);

  const outDir = resolve(args.outDir);
  await mkdir(outDir, { recursive: true });
  const jsonPath = join(outDir, "process-graph.json");
  await writeFile(jsonPath, JSON.stringify(graph, null, 2), "utf8");

  process.stdout.write(
    `\n${graph.meta.name}\n` +
      `  workflows : ${graph.meta.workflowCount}\n` +
      `  systems   : ${graph.meta.systemCount}\n` +
      `  steps     : ${graph.meta.stepCount}\n` +
      `  pathways  : ${graph.meta.pathwayCount}\n\n` +
      `  → ${jsonPath}\n`,
  );

  if (!args.jsonOnly) {
    const htmlPath = join(outDir, "process-map.html");
    await writeFile(htmlPath, renderProcessMapHtml(graph), "utf8");
    process.stdout.write(`  → ${htmlPath}  (open in a browser)\n`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`process-viz failed: ${message}\n`);
  process.exitCode = 1;
});
