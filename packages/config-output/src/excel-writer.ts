import type { ProjectConfig } from "@rpa-platform/config-schema";
import ExcelJS from "exceljs";

// TODO(verify-excel-columns): Column order and tab names below are sensible
// defaults. They MUST be verified against a real REFramework Config.xlsx
// sample before this writer is wired up to a project that runs against an
// actual UiPath robot. The legacy framework reads Excel by column position
// in some workflows and by header name in others — getting this wrong will
// surface as runtime KeyNotFound errors at the robot, not as a build failure.
// Once the user supplies a sample Excel from the REFramework, update the
// SHEET_*_COLUMNS arrays below to match exactly.

const SHEET_SETTINGS_COLUMNS = ["Name", "Value", "Description"] as const;
const SHEET_CONSTANTS_COLUMNS = ["Name", "Value", "Description"] as const;
const SHEET_ASSETS_COLUMNS = ["Name", "Type", "Value", "Scope", "Description"] as const;
const SHEET_CREDENTIALS_COLUMNS = ["Name", "Kind", "Description"] as const;

export async function writeConfigExcel(config: ProjectConfig): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "rpa-platform";
  workbook.created = new Date(0);

  addSettingsSheet(workbook, "Settings", config.settings);
  addSettingsSheet(workbook, "Constants", config.constants);
  addAssetsSheet(workbook, config);
  addCredentialsSheet(workbook, config);

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}

function addSettingsSheet(
  workbook: ExcelJS.Workbook,
  name: "Settings" | "Constants",
  values: Readonly<Record<string, unknown>>,
): void {
  const sheet = workbook.addWorksheet(name);
  const columns = name === "Settings" ? SHEET_SETTINGS_COLUMNS : SHEET_CONSTANTS_COLUMNS;
  sheet.addRow([...columns]);
  for (const [key, value] of Object.entries(values)) {
    sheet.addRow([key, formatScalar(value), ""]);
  }
}

function addAssetsSheet(workbook: ExcelJS.Workbook, config: ProjectConfig): void {
  const sheet = workbook.addWorksheet("Assets");
  sheet.addRow([...SHEET_ASSETS_COLUMNS]);
  for (const asset of config.assets) {
    const value = asset.type === "credential" ? asset.value : formatScalar(asset.value);
    sheet.addRow([asset.name, asset.type, value, asset.scope, asset.description ?? ""]);
  }
}

function addCredentialsSheet(workbook: ExcelJS.Workbook, config: ProjectConfig): void {
  const sheet = workbook.addWorksheet("Credentials");
  sheet.addRow([...SHEET_CREDENTIALS_COLUMNS]);
  for (const credential of config.credentials) {
    sheet.addRow([credential.name, credential.kind, credential.description ?? ""]);
  }
}

function formatScalar(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

export const EXCEL_COLUMN_ORDER = {
  Settings: SHEET_SETTINGS_COLUMNS,
  Constants: SHEET_CONSTANTS_COLUMNS,
  Assets: SHEET_ASSETS_COLUMNS,
  Credentials: SHEET_CREDENTIALS_COLUMNS,
} as const;
