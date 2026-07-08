#!/usr/bin/env npx tsx
//
// Generates a sample Data/Config.xlsx for a BRAND-NEW UiPath RPA project.
//
// This is the SINGLE SOURCE OF TRUTH the CI/CD pipeline reads. It contains:
//   - The 3 standard REFramework tabs the robot reads at runtime
//     (Settings, Constants, Assets) — unchanged behaviour.
//   - Extra pipeline tabs the deploy script reads and the robot IGNORES
//     (Pipeline, Dev/Test/Stage/Prod Assets, Queues, Buckets).
//
// Run:  npx tsx scripts/make-config-xlsx.ts
// Writes: Data/Config.xlsx (relative to the current working directory).
//
// Use this ONLY for a new project. To upgrade an EXISTING Config.xlsx that
// already has real Settings/Constants/Assets, use add-pipeline-tabs.ts instead
// (it preserves your existing tabs). Re-running this OVERWRITES Data/Config.xlsx.
//

import ExcelJS from "exceljs";
import * as fs from "node:fs";
import * as path from "node:path";
import { addSheet, addMissingPipelineTabs } from "./config-tabs.js";

const OUTPUT_PATH = process.env["CONFIG_XLSX_PATH"] ?? path.join("Data", "Config.xlsx");

async function main(): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "rpa-platform CI/CD";
  workbook.created = new Date(0); // deterministic so the file is reproducible

  // ==========================================================================
  // STANDARD REFramework tabs — the robot reads these at runtime.
  // Do NOT rename these tabs or their headers.
  // ==========================================================================

  addSheet(workbook, "Settings", ["Name", "Value", "Description"], [
    ["OrchestratorQueueName", "Test_1_Queue", "Queue the Performer pulls from"],
    ["MaxRetryNumber", 2, "Business-exception retries"],
    ["logF_BusinessProcessName", "Test_1", "Name used in log fields"],
  ]);

  addSheet(workbook, "Constants", ["Name", "Value", "Description"], [
    ["MaxConsecutiveSystemExceptions", 3, "Stop after N system exceptions in a row"],
    ["RetryNumberGetTransactionItem", 2, "Retries when fetching a transaction item"],
  ]);

  // Assets: Name | Asset | Description
  //   Name  = the key your workflow reads via Config("...")
  //   Asset = the Orchestrator asset NAME the robot resolves at runtime.
  // The Asset column values MUST match the "Name" column in the per-tenant asset
  // tabs — that's the link between the robot and what the pipeline creates.
  addSheet(workbook, "Assets", ["Name", "Asset", "Description"], [
    ["Environment", "Test_1_Environment", "Resolves to the Orchestrator asset Test_1_Environment"],
    ["ApplicationUrl", "Test_1_ApplicationUrl", "Resolves to the Orchestrator asset Test_1_ApplicationUrl"],
  ]);

  // ==========================================================================
  // PIPELINE tabs — the deploy script reads these; the robot IGNORES them.
  // ==========================================================================

  addMissingPipelineTabs(workbook, {
    pipeline: [
      ["ProjectName", "Test_1"],
      ["RepoName", "Test_1"],
      ["FolderPath", "Unattended Automations/Test_1"],
    ],
    assetsByTenant: {
      dev: [
        ["Test_1_Environment", "text", "Development", "Environment label"],
        ["Test_1_ApplicationUrl", "text", "https://dev-app.example.com", "App URL for dev"],
        ["Test_1_MaxRetries", "integer", 3, "Retry attempts"],
        ["Test_1_IsEnabled", "bool", true, "Master on/off switch"],
      ],
      test: [
        ["Test_1_Environment", "text", "Test", "Environment label"],
        ["Test_1_ApplicationUrl", "text", "https://test-app.example.com", "App URL for test"],
        ["Test_1_MaxRetries", "integer", 3, "Retry attempts"],
        ["Test_1_IsEnabled", "bool", true, "Master on/off switch"],
      ],
      stage: [
        ["Test_1_Environment", "text", "Staging", "Environment label"],
        ["Test_1_ApplicationUrl", "text", "https://stage-app.example.com", "App URL for stage"],
        ["Test_1_MaxRetries", "integer", 5, "Retry attempts"],
        ["Test_1_IsEnabled", "bool", true, "Master on/off switch"],
      ],
      prod: [
        ["Test_1_Environment", "text", "Production", "Environment label"],
        ["Test_1_ApplicationUrl", "text", "https://app.example.com", "App URL for prod"],
        ["Test_1_MaxRetries", "integer", 5, "Retry attempts"],
        ["Test_1_IsEnabled", "bool", true, "Master on/off switch"],
      ],
    },
    queues: [["Test_1_Queue", "Work items for Test_1", 2, true, true, false]],
    buckets: [["Test_1_Bucket", "Output files for Test_1"]],
  });

  const dir = path.dirname(OUTPUT_PATH);
  if (dir !== "" && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  await workbook.xlsx.writeFile(OUTPUT_PATH);
  console.log(`[make-config] Wrote ${OUTPUT_PATH}`);
  console.log("[make-config] Tabs:");
  workbook.worksheets.forEach((ws) => console.log(`  - ${ws.name}`));
}

main().catch((err: unknown) => {
  console.error("[make-config] Failed:", err);
  process.exit(1);
});
