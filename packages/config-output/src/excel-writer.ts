import ExcelJS from "exceljs";
import type { ResolvedConfig } from "./resolve.js";

// Legacy Excel writer for projects whose pinned framework version is below
// the json-ready threshold. Per spec: 4 tabs (Settings, Constants, Assets,
// Queues). Emitted as a transitional artifact alongside Config.json — the
// reconciler still uploads both until the framework upgrades.
//
// TODO: VERIFY column order against a sample Excel from the existing
// REFramework. CLAUDE.md flags this as a "do not guess; ask the user for
// the sample before finalizing" item. The columns below are sensible
// defaults but may not match the framework's reader byte-for-byte.

const SETTINGS_COLUMNS = [
  { header: "Name", key: "name", width: 32 },
  { header: "Value", key: "value", width: 32 },
  { header: "Description", key: "description", width: 48 },
];

const CONSTANTS_COLUMNS = SETTINGS_COLUMNS;

const ASSETS_COLUMNS = [
  { header: "Name", key: "name", width: 32 },
  { header: "Type", key: "type", width: 16 },
  { header: "Value", key: "value", width: 32 },
  { header: "Description", key: "description", width: 48 },
];

const QUEUES_COLUMNS = [
  { header: "Name", key: "name", width: 32 },
  { header: "Description", key: "description", width: 48 },
  { header: "AutoRetry", key: "autoRetry", width: 12 },
  { header: "MaxRetries", key: "maxRetries", width: 12 },
  { header: "UniqueReference", key: "uniqueReference", width: 16 },
  { header: "Encrypted", key: "encrypted", width: 12 },
];

export async function writeConfigXlsx(resolved: ResolvedConfig): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "rpa-platform";
  workbook.created = new Date(0); // deterministic for snapshot stability
  workbook.modified = new Date(0);

  const settingsSheet = workbook.addWorksheet("Settings");
  settingsSheet.columns = SETTINGS_COLUMNS;
  for (const [name, value] of Object.entries(resolved.settings)) {
    settingsSheet.addRow({ name, value, description: "" });
  }

  const constantsSheet = workbook.addWorksheet("Constants");
  constantsSheet.columns = CONSTANTS_COLUMNS;
  for (const [name, value] of Object.entries(resolved.constants)) {
    constantsSheet.addRow({ name, value, description: "" });
  }

  const assetsSheet = workbook.addWorksheet("Assets");
  assetsSheet.columns = ASSETS_COLUMNS;
  for (const asset of resolved.assets) {
    assetsSheet.addRow({
      name: asset.name,
      type: asset.type,
      value: stringifyAssetValue(asset.value),
      description: asset.description ?? "",
    });
  }

  const queuesSheet = workbook.addWorksheet("Queues");
  queuesSheet.columns = QUEUES_COLUMNS;
  for (const queue of resolved.queues) {
    queuesSheet.addRow({
      name: queue.name,
      description: queue.description ?? "",
      autoRetry: queue.autoRetry,
      maxRetries: queue.maxRetries,
      uniqueReference: queue.uniqueReference,
      encrypted: queue.encrypted,
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}

function stringifyAssetValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}
