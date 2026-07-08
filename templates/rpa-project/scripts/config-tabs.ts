//
// Shared definitions for the Config.xlsx pipeline tabs.
//
// One source of truth for tab names, headers, and the sheet-writing helper, so
// the "create fresh" script (make-config-xlsx.ts) and the "upgrade existing"
// script (add-pipeline-tabs.ts) can never drift apart.
//
// The deploy parser (deploy.ts) resolves these tabs by tenant word + keyword,
// tolerating spaces/hyphens/case — so the exact display names here are for
// humans; the parser stays decoupled.
//

import ExcelJS from "exceljs";

export const TENANTS = ["dev", "test", "stage", "prod"] as const;
export type Tenant = (typeof TENANTS)[number];

// Column headers (row 1 always).
export const ASSET_HEADERS = ["Name", "Type", "Value", "Description"];
export const QUEUE_HEADERS = ["Name", "Description", "MaxRetries", "AutoRetry", "UniqueReference", "Encrypted"];
export const BUCKET_HEADERS = ["Name", "Description"];
export const PIPELINE_HEADERS = ["Key", "Value"];

// Human guidance, attached as a comment on the first header cell.
export const ASSET_NOTE =
  "Assets created in this tenant. Type: text | integer | bool | credential. " +
  "For credential, leave Value blank — the secret is injected from GitHub Secrets, never stored here.";
export const QUEUE_NOTE = "Queues created in the folder above. AutoRetry/UniqueReference/Encrypted are TRUE/FALSE.";
export const BUCKET_NOTE = "Storage buckets created in the folder above.";
export const PIPELINE_NOTE = "Pipeline metadata. FolderPath is the Orchestrator folder (use / to separate nested folders).";

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF1F4E78" },
};

/** Display name for a tenant's asset tab, e.g. "Dev Assets". */
export function assetTabName(tenant: Tenant): string {
  return `${tenant[0]!.toUpperCase()}${tenant.slice(1)} Assets`;
}

/** Normalize a sheet name for tolerant matching: lowercase, strip non-alphanumerics. */
export function normalizeToken(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/gu, "");
}

/** True if the workbook already has a sheet matching `name` (space/hyphen/case-insensitive). */
export function hasSheet(workbook: ExcelJS.Workbook, name: string): boolean {
  const target = normalizeToken(name);
  return workbook.worksheets.some((ws) => normalizeToken(ws.name) === target);
}

/**
 * Add a worksheet with a styled header on row 1. Any human guidance goes into a
 * cell comment on the first header cell — NEVER a separate row above the header,
 * because the deploy parser reads headers from row 1.
 */
export function addSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  headers: string[],
  rows: Array<Array<string | number | boolean>>,
  note?: string,
): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet(name);

  const headerRow = sheet.addRow(headers);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.alignment = { vertical: "middle", horizontal: "left" };
  });
  if (note !== undefined) {
    headerRow.getCell(1).note = note;
  }

  for (const row of rows) sheet.addRow(row);

  headers.forEach((header, i) => {
    const column = sheet.getColumn(i + 1);
    const longestCell = rows.reduce((max, row) => {
      const value = row[i];
      const length = value === undefined ? 0 : String(value).length;
      return Math.max(max, length);
    }, header.length);
    column.width = Math.min(Math.max(longestCell + 2, 12), 60);
  });

  sheet.views = [{ state: "frozen", ySplit: 1 }];
  return sheet;
}

/**
 * Add the pipeline tabs that don't already exist, in canonical order. Existing
 * tabs (Settings/Constants/Assets or any already-present pipeline tab) are left
 * untouched. `seed` supplies example rows; pass {} for headers-only tabs.
 * Returns the list of tab names actually added.
 */
export function addMissingPipelineTabs(
  workbook: ExcelJS.Workbook,
  seed: {
    pipeline?: Array<[string, string | number | boolean]>;
    assetsByTenant?: Partial<Record<Tenant, Array<Array<string | number | boolean>>>>;
    queues?: Array<Array<string | number | boolean>>;
    buckets?: Array<Array<string | number | boolean>>;
  },
): string[] {
  const added: string[] = [];

  if (!hasSheet(workbook, "Pipeline")) {
    addSheet(workbook, "Pipeline", PIPELINE_HEADERS, seed.pipeline ?? [], PIPELINE_NOTE);
    added.push("Pipeline");
  }

  for (const tenant of TENANTS) {
    const tabName = assetTabName(tenant);
    if (!hasSheet(workbook, tabName)) {
      addSheet(workbook, tabName, ASSET_HEADERS, seed.assetsByTenant?.[tenant] ?? [], ASSET_NOTE);
      added.push(tabName);
    }
  }

  if (!hasSheet(workbook, "Queues")) {
    addSheet(workbook, "Queues", QUEUE_HEADERS, seed.queues ?? [], QUEUE_NOTE);
    added.push("Queues");
  }

  if (!hasSheet(workbook, "Buckets")) {
    addSheet(workbook, "Buckets", BUCKET_HEADERS, seed.buckets ?? [], BUCKET_NOTE);
    added.push("Buckets");
  }

  return added;
}
