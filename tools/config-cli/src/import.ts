#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { importProjectConfigsFromExcel } from "@rpa-platform/config-roundtrip";
import { loadTenantConfigsFromDisk, writeTenantConfigsToDisk } from "./load-tenant-configs.js";

async function main(): Promise<void> {
  const [, , excelArg, projectArg] = process.argv;
  if (excelArg === undefined || projectArg === undefined) {
    process.stderr.write(
      "usage: rpa-config-import <input.xlsx> <project-dir>\n" +
        "  reads <input.xlsx>, validates, and writes the JSON files back into\n" +
        "  <project-dir>/{dev,test,stage,prod}/ for review and commit.\n",
    );
    process.exit(2);
  }
  const excelPath = resolve(excelArg);
  const projectDir = resolve(projectArg);
  const baseline = await loadTenantConfigsFromDisk(projectDir);
  const bytes = new Uint8Array(await readFile(excelPath));
  const restored = await importProjectConfigsFromExcel(bytes, baseline);
  await writeTenantConfigsToDisk(projectDir, restored);
  process.stdout.write(`updated ${projectDir} from ${excelPath}\n`);
}

main().catch((err: unknown) => {
  process.stderr.write(`config-import failed: ${describe(err)}\n`);
  process.exit(1);
});

function describe(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
