import { readdir, readFile, stat } from "node:fs/promises";
import { basename, extname, join, relative, sep } from "node:path";
import { parseXaml } from "@rpa-platform/xaml-parser";
import { ProcessIngestError } from "./errors.js";
import { readZipEntries } from "./zip.js";
import type { WorkflowSource } from "./types.js";

// ---------------------------------------------------------------------------
// Turns a source location — a checked-out repo directory or a `.nupkg` — into
// the parsed WorkflowSource[] the builder consumes, plus the process name and
// entry point read from UiPath's project.json. Parse failures on individual
// files are skipped (a single broken XAML should not sink the whole map) and
// reported back to the caller as warnings.
// ---------------------------------------------------------------------------

export interface IngestResult {
  readonly name: string;
  readonly source: string;
  readonly entryPoint: string | undefined;
  readonly sources: readonly WorkflowSource[];
  readonly warnings: readonly string[];
}

const SKIP_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  ".vscode",
  ".objects",
  ".local",
  ".tmh",
  "bin",
  "obj",
]);

/** Ingests either a directory of XAML or a `.nupkg`, chosen by inspecting the path. */
export async function ingestPath(path: string): Promise<IngestResult> {
  const stats = await stat(path).catch(() => {
    throw new ProcessIngestError(`Cannot read '${path}'.`);
  });
  if (stats.isDirectory()) return ingestDirectory(path);
  if (extname(path).toLowerCase() === ".nupkg" || extname(path).toLowerCase() === ".zip") {
    return ingestNupkg(path);
  }
  throw new ProcessIngestError(
    `Unsupported source '${path}'. Provide a project directory or a .nupkg file.`,
  );
}

export async function ingestDirectory(dir: string): Promise<IngestResult> {
  const xamlPaths = await collectXamlPaths(dir);
  const warnings: string[] = [];
  const sources: WorkflowSource[] = [];

  for (const filePath of xamlPaths) {
    const xml = await readFile(filePath, "utf8");
    const name = relative(dir, filePath).split(sep).join("/");
    const parsed = tryParse(xml, name, warnings);
    if (parsed !== undefined) sources.push({ name, path: filePath, parsed });
  }
  ensureNonEmpty(sources, dir);

  const project = await readProjectJson(async () => {
    const raw = await readFile(join(dir, "project.json"), "utf8").catch(() => undefined);
    return raw;
  });
  return {
    name: project.name ?? basename(dir),
    source: dir,
    entryPoint: project.main,
    sources,
    warnings,
  };
}

export async function ingestNupkg(filePath: string): Promise<IngestResult> {
  const archive = await readFile(filePath);
  const entries = readZipEntries(archive);
  const warnings: string[] = [];
  const sources: WorkflowSource[] = [];

  for (const zEntry of entries) {
    if (extname(zEntry.fileName).toLowerCase() !== ".xaml") continue;
    const name = normalizeNupkgName(zEntry.fileName);
    const parsed = tryParse(zEntry.data.toString("utf8"), name, warnings);
    if (parsed !== undefined)
      sources.push({ name, path: `${filePath}!${zEntry.fileName}`, parsed });
  }
  ensureNonEmpty(sources, filePath);

  const project = await readProjectJson(async () => {
    const projectEntry = entries.find(
      (e) => normalizeNupkgName(e.fileName).toLowerCase() === "project.json",
    );
    return projectEntry?.data.toString("utf8");
  });
  return {
    name: project.name ?? basename(filePath).replace(/\.nupkg$/iu, ""),
    source: filePath,
    entryPoint: project.main,
    sources,
    warnings,
  };
}

// ---- helpers -------------------------------------------------------------

async function collectXamlPaths(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) continue;
      out.push(...(await collectXamlPaths(join(dir, entry.name))));
    } else if (extname(entry.name).toLowerCase() === ".xaml") {
      out.push(join(dir, entry.name));
    }
  }
  return out.sort();
}

function tryParse(
  xml: string,
  name: string,
  warnings: string[],
): WorkflowSource["parsed"] | undefined {
  try {
    return parseXaml(xml);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    warnings.push(`Skipped '${name}': ${reason}`);
    return undefined;
  }
}

function ensureNonEmpty(sources: readonly WorkflowSource[], location: string): void {
  if (sources.length === 0) {
    throw new ProcessIngestError(`No parseable .xaml workflows found in '${location}'.`);
  }
}

interface ProjectMeta {
  readonly name: string | undefined;
  readonly main: string | undefined;
}

async function readProjectJson(load: () => Promise<string | undefined>): Promise<ProjectMeta> {
  const raw = await load();
  if (raw === undefined) return { name: undefined, main: undefined };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return { name: undefined, main: undefined };
    const record = parsed as Record<string, unknown>;
    return {
      name: typeof record["name"] === "string" ? record["name"] : undefined,
      main: typeof record["main"] === "string" ? record["main"] : undefined,
    };
  } catch {
    return { name: undefined, main: undefined };
  }
}

/** `content/Main.xaml` or `lib/net45/Process.xaml` -> a clean workflow name. */
function normalizeNupkgName(fileName: string): string {
  const clean = fileName.replace(/^\/+/u, "");
  const stripped = clean.replace(/^(?:content|lib(?:\/[^/]+)?)\//iu, "");
  return stripped;
}
