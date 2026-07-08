#!/usr/bin/env npx tsx
//
// Generates a sample Data/Config.xlsx for a UiPath RPA project.
//
// This is the SINGLE SOURCE OF TRUTH the CI/CD pipeline reads. It contains:
//   - The 3 standard REFramework tabs the robot reads at runtime
//     (Settings, Constants, Assets) — unchanged behaviour.
//   - Extra pipeline tabs the deploy script reads and the robot IGNORES
//     (Pipeline, Dev/Test/Stage/Prod Assets, Queues, Buckets).
//
// Run:  npx tsx scripts/make-config-xlsx.ts
// Writes: Data/Config.xlsx (relative to the current working directory)
//
// You normally run this ONCE to scaffold the file, then edit it in Excel.
// Re-running OVERWRITES Data/Config.xlsx — don't run it over a file you've edited.
//

import ExcelJS from "exceljs";
import * as fs from "node:fs";
import * as path from "node:path";

const OUTPUT_PATH = process.env["CONFIG_XLSX_PATH"] ?? path.join("Data", "Config.xlsx");

// A muted blue header fill so the human-facing tabs are easy to scan.
const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF1F4E78" },
};

function addSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  headers: string[],
  rows: Array<Array<string | number | boolean>>,
  note?: string,
): void {
  const sheet = workbook.addWorksheet(name);

  // IMPORTANT: the header MUST be row 1 — the deploy parser reads headers from
  // row 1. Any human guidance goes into a cell comment on the first header
  // cell, never a separate row above the header.
  const headerRow = sheet.addRow(headers);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.alignment = { vertical: "middle", horizontal: "left" };
  });
  if (note !== undefined) {
    headerRow.getCell(1).note = note;
  }

  for (const row of rows) {
    sheet.addRow(row);
  }

  // Reasonable column widths.
  headers.forEach((header, i) => {
    const column = sheet.getColumn(i + 1);
    const longestCell = rows.reduce((max, row) => {
      const value = row[i];
      const length = value === undefined ? 0 : String(value).length;
      return Math.max(max, length);
    }, header.length);
    column.width = Math.min(Math.max(longestCell + 2, 12), 60);
  });

  // Freeze the header row so it stays visible while scrolling.
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

function main(): void {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "rpa-platform CI/CD";
  workbook.created = new Date(0); // deterministic so the file is reproducible

  // ==========================================================================
  // STANDARD REFramework tabs — the robot reads these at runtime.
  // Do NOT rename these tabs or their headers.
  // ==========================================================================

  // Settings: Name | Value | Description  (robot reads Name + Value)
  addSheet(
    workbook,
    "Settings",
    ["Name", "Value", "Description"],
    [
      ["OrchestratorQueueName", "Test_1_Queue", "Queue the Performer pulls from"],
      ["MaxRetryNumber", 2, "Business-exception retries"],
      ["logF_BusinessProcessName", "Test_1", "Name used in log fields"],
    ],
  );

  // Constants: Name | Value | Description  (robot reads Name + Value)
  addSheet(
    workbook,
    "Constants",
    ["Name", "Value", "Description"],
    [
      ["MaxConsecutiveSystemExceptions", 3, "Stop after N system exceptions in a row"],
      ["RetryNumberGetTransactionItem", 2, "Retries when fetching a transaction item"],
    ],
  );

  // Assets: Name | Asset | Description
  //   Name  = the key your workflow reads via Config("...")
  //   Asset = the Orchestrator asset NAME the robot resolves at runtime
  // The Asset column values here MUST match the "Name" column in the
  // per-tenant asset tabs below — that is the link between the robot and
  // what the pipeline creates in Orchestrator.
  addSheet(
    workbook,
    "Assets",
    ["Name", "Asset", "Description"],
    [
      ["Environment", "Test_1_Environment", "Resolves to the Orchestrator asset Test_1_Environment"],
      ["ApplicationUrl", "Test_1_ApplicationUrl", "Resolves to the Orchestrator asset Test_1_ApplicationUrl"],
    ],
  );

  // ==========================================================================
  // PIPELINE tabs — the deploy script reads these; the robot IGNORES them.
  // ==========================================================================

  // Pipeline: Key | Value  (project metadata)
  addSheet(
    workbook,
    "Pipeline",
    ["Key", "Value"],
    [
      ["ProjectName", "Test_1"],
      ["RepoName", "Test_1"],
      ["FolderPath", "Unattended Automations/Test_1"],
    ],
    "Pipeline metadata. FolderPath is the Orchestrator folder (use / to separate nested folders).",
  );

  // Per-tenant asset tabs. Columns: Name | Type | Value | Description
  //   Name  = Orchestrator asset name (matches the Assets tab's Asset column)
  //   Type  = text | integer | bool | credential
  //   Value = the value to set for THIS tenant (leave blank for credential)
  const assetHeaders = ["Name", "Type", "Value", "Description"];
  const assetNote =
    "Assets created in this tenant. Type: text | integer | bool | credential. " +
    "For credential, leave Value blank — the secret is injected from GitHub Secrets, never stored here.";

  addSheet(
    workbook,
    "Dev Assets",
    assetHeaders,
    [
      ["Test_1_Environment", "text", "Development", "Environment label"],
      ["Test_1_ApplicationUrl", "text", "https://dev-app.example.com", "App URL for dev"],
      ["Test_1_MaxRetries", "integer", 3, "Retry attempts"],
      ["Test_1_IsEnabled", "bool", true, "Master on/off switch"],
    ],
    assetNote,
  );

  addSheet(
    workbook,
    "Test Assets",
    assetHeaders,
    [
      ["Test_1_Environment", "text", "Test", "Environment label"],
      ["Test_1_ApplicationUrl", "text", "https://test-app.example.com", "App URL for test"],
      ["Test_1_MaxRetries", "integer", 3, "Retry attempts"],
      ["Test_1_IsEnabled", "bool", true, "Master on/off switch"],
    ],
    assetNote,
  );

  addSheet(
    workbook,
    "Stage Assets",
    assetHeaders,
    [
      ["Test_1_Environment", "text", "Staging", "Environment label"],
      ["Test_1_ApplicationUrl", "text", "https://stage-app.example.com", "App URL for stage"],
      ["Test_1_MaxRetries", "integer", 5, "Retry attempts"],
      ["Test_1_IsEnabled", "bool", true, "Master on/off switch"],
    ],
    assetNote,
  );

  addSheet(
    workbook,
    "Prod Assets",
    assetHeaders,
    [
      ["Test_1_Environment", "text", "Production", "Environment label"],
      ["Test_1_ApplicationUrl", "text", "https://app.example.com", "App URL for prod"],
      ["Test_1_MaxRetries", "integer", 5, "Retry attempts"],
      ["Test_1_IsEnabled", "bool", true, "Master on/off switch"],
    ],
    assetNote,
  );

  // Queues: Name | Description | MaxRetries | AutoRetry | UniqueReference | Encrypted
  addSheet(
    workbook,
    "Queues",
    ["Name", "Description", "MaxRetries", "AutoRetry", "UniqueReference", "Encrypted"],
    [["Test_1_Queue", "Work items for Test_1", 2, true, true, false]],
    "Queues created in the folder above. AutoRetry/UniqueReference/Encrypted are TRUE/FALSE.",
  );

  // Buckets: Name | Description
  addSheet(
    workbook,
    "Buckets",
    ["Name", "Description"],
    [["Test_1_Bucket", "Output files for Test_1"]],
    "Storage buckets created in the folder above.",
  );

  // Write it.
  const dir = path.dirname(OUTPUT_PATH);
  if (dir !== "" && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  workbook.xlsx
    .writeFile(OUTPUT_PATH)
    .then(() => {
      console.log(`[make-config] Wrote ${OUTPUT_PATH}`);
      console.log("[make-config] Tabs:");
      workbook.worksheets.forEach((ws) => console.log(`  - ${ws.name}`));
    })
    .catch((err: unknown) => {
      console.error("[make-config] Failed:", err);
      process.exit(1);
    });
}

main();
