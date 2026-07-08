#!/usr/bin/env npx tsx
//
// Upgrade an EXISTING Data/Config.xlsx to the pipeline format — in place.
//
// Use this to roll the CI/CD format out to the dev template and to existing
// projects that already have a real Config.xlsx (with the devs' actual
// Settings / Constants / Assets). It ADDS the pipeline tabs
// (Pipeline, Dev/Test/Stage/Prod Assets, Queues, Buckets) and leaves every
// existing tab untouched. It is idempotent — tabs that already exist are skipped.
//
// Usage:
//   npx tsx scripts/add-pipeline-tabs.ts                 # upgrades Data/Config.xlsx in place
//   npx tsx scripts/add-pipeline-tabs.ts path/to/Config.xlsx
//   npx tsx scripts/add-pipeline-tabs.ts in.xlsx out.xlsx   # write to a different file
//
// Safety: unless you give a separate output path, the original is backed up to
// <file>.bak before writing. After running, OPEN the file and confirm your
// Settings/Constants/Assets tabs are intact (exceljs rewrites the whole workbook).
//
// The added per-tenant asset tabs start EMPTY (headers only) so you don't deploy
// placeholder assets by accident. The Pipeline tab is seeded with the three keys
// (ProjectName, RepoName, FolderPath) with blank values for you to fill in.
//

import ExcelJS from "exceljs";
import * as fs from "node:fs";
import * as path from "node:path";
import { addMissingPipelineTabs, hasSheet } from "./config-tabs.js";

async function main(): Promise<void> {
  const inputPath = process.argv[2] ?? path.join("Data", "Config.xlsx");
  const outputPath = process.argv[3] ?? inputPath;

  if (!fs.existsSync(inputPath)) {
    console.error(`[upgrade] File not found: ${inputPath}`);
    console.error(`[upgrade] For a brand-new project, run: npx tsx scripts/make-config-xlsx.ts`);
    process.exit(1);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(inputPath);

  const before = workbook.worksheets.map((ws) => ws.name);
  console.log(`[upgrade] Existing tabs: ${before.join(", ")}`);

  // Warn if the standard REFramework tabs are missing — this might be the wrong file.
  for (const std of ["Settings", "Constants", "Assets"]) {
    if (!hasSheet(workbook, std)) {
      console.warn(`[upgrade] WARNING: no "${std}" tab found — is this really a REFramework Config.xlsx?`);
    }
  }

  const added = addMissingPipelineTabs(workbook, {
    // Seed the Pipeline tab with the keys, blank values for the dev to fill in.
    pipeline: [
      ["ProjectName", ""],
      ["RepoName", ""],
      ["FolderPath", ""],
    ],
    // Per-tenant asset tabs start empty (headers only). Queues/Buckets too.
  });

  if (added.length === 0) {
    console.log("[upgrade] Nothing to do — all pipeline tabs already present.");
    return;
  }

  // Back up the original unless writing to a distinct output file.
  if (outputPath === inputPath) {
    const backup = `${inputPath}.bak`;
    fs.copyFileSync(inputPath, backup);
    console.log(`[upgrade] Backed up original to ${backup}`);
  }

  await workbook.xlsx.writeFile(outputPath);
  console.log(`[upgrade] Added tabs: ${added.join(", ")}`);
  console.log(`[upgrade] Wrote ${outputPath}`);
  console.log("[upgrade] NEXT: open the file, fill in the Pipeline FolderPath and the per-tenant asset rows.");
  console.log("[upgrade] Then verify with: TENANT=dev npx tsx scripts/deploy.ts --validate");
}

main().catch((err: unknown) => {
  console.error("[upgrade] Failed:", err);
  process.exit(1);
});
