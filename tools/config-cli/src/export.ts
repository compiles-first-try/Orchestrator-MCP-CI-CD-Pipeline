#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { exportProjectConfigsToExcel } from "@rpa-platform/config-roundtrip";
import { loadTenantConfigsFromDisk } from "./load-tenant-configs.js";

async function main(): Promise<void> {
  const [, , projectArg, outArg] = process.argv;
  if (projectArg === undefined) {
    process.stderr.write(
      "usage: rpa-config-export <project-dir> [<output.xlsx>]\n" +
        "  project-dir must contain dev/, test/, stage/, prod/ subdirectories,\n" +
        "  each with the seven project config JSON files.\n",
    );
    process.exit(2);
  }
  const projectDir = resolve(projectArg);
  const outputPath = resolve(outArg ?? `${projectDir}-config.xlsx`);
  const perTenant = await loadTenantConfigsFromDisk(projectDir);
  const bytes = await exportProjectConfigsToExcel(perTenant);
  await writeFile(outputPath, bytes);
  process.stdout.write(`wrote ${outputPath}\n`);
}

main().catch((err: unknown) => {
  process.stderr.write(`config-export failed: ${describe(err)}\n`);
  process.exit(1);
});

function describe(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
