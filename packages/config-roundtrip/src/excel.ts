import type { ProjectConfig, SettingValue } from "@rpa-platform/config-schema";
import type { TenantName } from "@rpa-platform/shared";
import ExcelJS from "exceljs";
import { ConfigRoundtripError } from "./errors.js";
import { TENANT_ORDER, type TenantConfigs } from "./types.js";

interface AssetRow {
  readonly name: string;
  readonly type: "text" | "integer" | "boolean" | "credential";
  readonly scope: "global" | "per-user" | "per-robot";
  readonly description: string | undefined;
  readonly values: Readonly<Record<TenantName, unknown>>;
}

interface KeyedRow {
  readonly key: string;
  readonly values: Readonly<Record<TenantName, SettingValue>>;
}

const SETTINGS_SHEET = "Settings";
const CONSTANTS_SHEET = "Constants";
const ASSETS_SHEET = "Assets";

const KEYED_HEADERS = ["Name", "dev", "test", "stage", "prod"] as const;
const ASSET_HEADERS = [
  "Name",
  "Type",
  "Scope",
  "dev",
  "test",
  "stage",
  "prod",
  "Description",
] as const;

export async function exportProjectConfigsToExcel(perTenant: TenantConfigs): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "rpa-platform";
  workbook.created = new Date(0);

  writeKeyedSheet(
    workbook,
    SETTINGS_SHEET,
    collectKeys(perTenant, (c) => c.settings),
    perTenant,
    (c) => c.settings,
  );
  writeKeyedSheet(
    workbook,
    CONSTANTS_SHEET,
    collectKeys(perTenant, (c) => c.constants),
    perTenant,
    (c) => c.constants,
  );
  writeAssetsSheet(workbook, perTenant);

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}

export async function importProjectConfigsFromExcel(
  bytes: Uint8Array,
  baseline: TenantConfigs,
): Promise<TenantConfigs> {
  const workbook = new ExcelJS.Workbook();
  // exceljs's TS types declare load(buffer: Buffer) but accept any
  // ArrayBuffer-like input at runtime. Cast through unknown to bypass the
  // Buffer subtype mismatch that newer @types/node introduces.
  const loader = workbook.xlsx.load as unknown as (
    input: ArrayBufferLike,
  ) => Promise<ExcelJS.Workbook>;
  await loader.call(workbook.xlsx, bytes.buffer);
  return {
    dev: applySheets(workbook, baseline.dev, "dev"),
    test: applySheets(workbook, baseline.test, "test"),
    stage: applySheets(workbook, baseline.stage, "stage"),
    prod: applySheets(workbook, baseline.prod, "prod"),
  };
}

function writeKeyedSheet(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  keys: readonly string[],
  perTenant: TenantConfigs,
  getter: (c: ProjectConfig) => Readonly<Record<string, SettingValue>>,
): void {
  const sheet = workbook.addWorksheet(sheetName);
  sheet.addRow([...KEYED_HEADERS]);
  for (const key of keys) {
    sheet.addRow([
      key,
      formatValue(getter(perTenant.dev)[key]),
      formatValue(getter(perTenant.test)[key]),
      formatValue(getter(perTenant.stage)[key]),
      formatValue(getter(perTenant.prod)[key]),
    ]);
  }
}

function writeAssetsSheet(workbook: ExcelJS.Workbook, perTenant: TenantConfigs): void {
  const sheet = workbook.addWorksheet(ASSETS_SHEET);
  sheet.addRow([...ASSET_HEADERS]);
  const rows = collectAssetRows(perTenant);
  for (const row of rows) {
    sheet.addRow([
      row.name,
      row.type,
      row.scope,
      formatValue(row.values.dev),
      formatValue(row.values.test),
      formatValue(row.values.stage),
      formatValue(row.values.prod),
      row.description ?? "",
    ]);
  }
}

function applySheets(
  workbook: ExcelJS.Workbook,
  baseline: ProjectConfig,
  tenant: TenantName,
): ProjectConfig {
  const settings = applyKeyedSheet(workbook, SETTINGS_SHEET, baseline.settings, tenant);
  const constants = applyKeyedSheet(workbook, CONSTANTS_SHEET, baseline.constants, tenant);
  const assets = applyAssetsSheet(workbook, baseline, tenant);
  return {
    ...baseline,
    settings,
    constants,
    assets,
  };
}

function applyKeyedSheet(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  baseline: Readonly<Record<string, SettingValue>>,
  tenant: TenantName,
): Readonly<Record<string, SettingValue>> {
  const sheet = workbook.getWorksheet(sheetName);
  if (sheet === undefined) return baseline;
  const tenantColumn = TENANT_ORDER.indexOf(tenant) + 2;
  const result: Record<string, SettingValue> = {};
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = row.values as readonly unknown[];
    const key = stringCell(values[1]);
    if (key === undefined || key.length === 0) return;
    const cell = values[tenantColumn];
    const parsed = parseValue(cell);
    if (parsed !== undefined) {
      result[key] = parsed;
    }
  });
  return Object.keys(result).length === 0 ? baseline : result;
}

function applyAssetsSheet(
  workbook: ExcelJS.Workbook,
  baseline: ProjectConfig,
  tenant: TenantName,
): ProjectConfig["assets"] {
  const sheet = workbook.getWorksheet(ASSETS_SHEET);
  if (sheet === undefined) return baseline.assets;
  const tenantColumn = TENANT_ORDER.indexOf(tenant) + 4;
  const baselineByName = new Map(baseline.assets.map((a) => [a.name, a]));
  const result: ProjectConfig["assets"][number][] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = row.values as readonly unknown[];
    const name = stringCell(values[1]);
    const type = stringCell(values[2]);
    if (name === undefined || type === undefined) return;
    const scope = (stringCell(values[3]) ?? "global") as "global" | "per-user" | "per-robot";
    const description = stringCell(values[8]);
    const cell = values[tenantColumn];
    const parsed = parseValue(cell);
    const existing = baselineByName.get(name);
    const built = buildAsset(name, type, scope, parsed, description, existing);
    if (built !== undefined) result.push(built);
  });
  return result;
}

function buildAsset(
  name: string,
  type: string,
  scope: "global" | "per-user" | "per-robot",
  parsed: SettingValue | undefined,
  description: string | undefined,
  existing: ProjectConfig["assets"][number] | undefined,
): ProjectConfig["assets"][number] | undefined {
  const desc =
    description !== undefined && description.length > 0 ? description : existing?.description;
  switch (type) {
    case "text":
      return {
        name,
        type: "text",
        scope,
        value:
          typeof parsed === "string" ? parsed : existing?.type === "text" ? existing.value : "",
        ...(desc !== undefined ? { description: desc } : {}),
      };
    case "integer":
      return {
        name,
        type: "integer",
        scope,
        value:
          typeof parsed === "number"
            ? Math.trunc(parsed)
            : existing?.type === "integer"
              ? existing.value
              : 0,
        ...(desc !== undefined ? { description: desc } : {}),
      };
    case "boolean":
      return {
        name,
        type: "boolean",
        scope,
        value:
          typeof parsed === "boolean"
            ? parsed
            : existing?.type === "boolean"
              ? existing.value
              : false,
        ...(desc !== undefined ? { description: desc } : {}),
      };
    case "credential":
      return {
        name,
        type: "credential",
        scope,
        value:
          typeof parsed === "string"
            ? parsed
            : existing?.type === "credential"
              ? existing.value
              : "",
        ...(desc !== undefined ? { description: desc } : {}),
      };
    default:
      throw new ConfigRoundtripError(
        `unknown asset type '${type}' for asset '${name}' in Excel import`,
      );
  }
}

function collectKeys(
  perTenant: TenantConfigs,
  getter: (c: ProjectConfig) => Readonly<Record<string, SettingValue>>,
): readonly string[] {
  const seen = new Set<string>();
  for (const tenant of TENANT_ORDER) {
    for (const key of Object.keys(getter(perTenant[tenant]))) seen.add(key);
  }
  return Array.from(seen).sort();
}

function collectAssetRows(perTenant: TenantConfigs): readonly AssetRow[] {
  const byName = new Map<string, AssetRow>();
  for (const tenant of TENANT_ORDER) {
    const config = perTenant[tenant];
    for (const asset of config.assets) {
      const existing = byName.get(asset.name);
      const values = existing?.values ?? {
        dev: undefined,
        test: undefined,
        stage: undefined,
        prod: undefined,
      };
      byName.set(asset.name, {
        name: asset.name,
        type: asset.type,
        scope: asset.scope,
        description: asset.description ?? existing?.description,
        values: { ...values, [tenant]: asset.value },
      });
    }
  }
  return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function parseValue(cell: unknown): SettingValue | undefined {
  if (cell === null || cell === undefined) return undefined;
  if (typeof cell === "string") {
    if (cell.length === 0) return undefined;
    if (cell === "true") return true;
    if (cell === "false") return false;
    const asNumber = Number(cell);
    if (cell.trim() !== "" && Number.isNaN(asNumber) === false && /^-?\d+(\.\d+)?$/.test(cell)) {
      return asNumber;
    }
    return cell;
  }
  if (typeof cell === "number" || typeof cell === "boolean") return cell;
  if (typeof cell === "object" && "text" in cell) {
    return parseValue((cell as { text: unknown }).text);
  }
  return undefined;
}

function stringCell(cell: unknown): string | undefined {
  if (cell === null || cell === undefined) return undefined;
  if (typeof cell === "string") return cell.length === 0 ? undefined : cell;
  if (typeof cell === "number" || typeof cell === "boolean") return String(cell);
  if (typeof cell === "object" && "text" in cell) {
    return stringCell((cell as { text: unknown }).text);
  }
  return undefined;
}
