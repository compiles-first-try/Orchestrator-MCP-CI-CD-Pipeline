import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { writeConfigXlsx } from "../src/excel-writer.js";
import type { ResolvedConfig } from "../src/resolve.js";

const SAMPLE: ResolvedConfig = {
  tenant: "dev",
  settings: { MaxRetry: 3 },
  constants: { FrameworkVersion: "1.0.0" },
  assets: [{ name: "ApiUrl", type: "text", value: "https://example.com" }],
  queues: [{ name: "Q", autoRetry: false, maxRetries: 3, uniqueReference: false, encrypted: false }],
  buckets: [{ name: "config", provider: "orchestrator" }],
  credentials: [{ name: "DbPwd", kind: "credential", secretSource: "manual", secretRef: "k" }],
};

describe("writeConfigXlsx", () => {
  it("emits a workbook with the four documented tabs", async () => {
    const bytes = await writeConfigXlsx(SAMPLE);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes));
    const names = wb.worksheets.map((s) => s.name);
    expect(names).toEqual(["Settings", "Constants", "Assets", "Queues"]);
  });

  it("populates each tab with the resolved entries", async () => {
    const bytes = await writeConfigXlsx(SAMPLE);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes));
    const settingsRows = wb.getWorksheet("Settings")?.rowCount ?? 0;
    expect(settingsRows).toBeGreaterThanOrEqual(2); // header + 1 entry
    // After load(), column keys are not preserved — address by 1-based index.
    const assetRow = wb.getWorksheet("Assets")?.getRow(2);
    expect(assetRow?.getCell(1).value).toBe("ApiUrl");
    expect(assetRow?.getCell(2).value).toBe("text");
  });
});
