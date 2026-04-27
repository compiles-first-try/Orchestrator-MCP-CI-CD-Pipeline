import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import type { ProjectConfig } from "@rpa-platform/config-schema";
import type { FrameworkReleaseSummary } from "@rpa-platform/framework-version";
import { buildConfigArtifacts } from "../src/index.js";

const config: ProjectConfig = {
  settings: { LogLevel: "info", MaxRows: 100 },
  constants: { CompanyName: "Acme" },
  assets: [
    { name: "OrchestratorUrl", type: "text", value: "https://x", scope: "global" },
    { name: "MaxRetries", type: "integer", value: 3, scope: "global" },
    { name: "FeatureFlag", type: "boolean", value: true, scope: "global" },
    { name: "ApiCreds", type: "credential", value: "ServiceAccount", scope: "global" },
  ],
  queues: [
    {
      name: "Invoices",
      acceptAutoRetry: false,
      maxRetries: 1,
      enforceUniqueReferences: true,
    },
  ],
  buckets: [{ name: "Inputs", storageProvider: "orchestrator" }],
  credentials: [
    { name: "ServiceAccount", kind: "username-password" },
    { name: "VendorApiKey", kind: "api-key" },
  ],
  overrides: {},
};

const releasesPreJson: FrameworkReleaseSummary[] = [
  { version: "1.0.0", jsonReady: false },
  { version: "1.1.0", jsonReady: false },
];

const releasesJsonReady: FrameworkReleaseSummary[] = [
  { version: "1.0.0", jsonReady: false },
  { version: "2.0.0", jsonReady: true },
];

describe("buildConfigArtifacts", () => {
  it("always writes Config.json", async () => {
    const result = await buildConfigArtifacts({
      config,
      pinnedFrameworkVersion: "2.0.0",
      releases: releasesJsonReady,
      generatedAt: new Date("2026-04-26T00:00:00Z"),
    });
    expect(result.json.fileName).toBe("Config.json");
    const parsed = JSON.parse(result.json.contents) as Record<string, unknown>;
    expect(parsed["assets"]).toBeDefined();
    expect((parsed["_meta"] as { frameworkVersion: string }).frameworkVersion).toBe("2.0.0");
  });

  it("does NOT write Config.xlsx when the pinned framework is JSON-ready", async () => {
    const result = await buildConfigArtifacts({
      config,
      pinnedFrameworkVersion: "2.0.0",
      releases: releasesJsonReady,
    });
    expect(result.excel).toBeUndefined();
  });

  it("ALSO writes Config.xlsx when the pinned framework predates JSON support", async () => {
    const result = await buildConfigArtifacts({
      config,
      pinnedFrameworkVersion: "1.1.0",
      releases: releasesPreJson,
    });
    expect(result.excel).toBeDefined();
    expect(result.excel?.fileName).toBe("Config.xlsx");
    expect(result.excel?.contents.byteLength).toBeGreaterThan(0);
  });

  it("Excel has the four expected tabs (Settings, Constants, Assets, Credentials)", async () => {
    const result = await buildConfigArtifacts({
      config,
      pinnedFrameworkVersion: "1.1.0",
      releases: releasesPreJson,
    });
    expect(result.excel).toBeDefined();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(result.excel!.contents));
    const names = wb.worksheets.map((w) => w.name).sort();
    expect(names).toEqual(["Assets", "Constants", "Credentials", "Settings"]);
  });

  it("Excel Assets tab has one row per asset with the documented column order", async () => {
    const result = await buildConfigArtifacts({
      config,
      pinnedFrameworkVersion: "1.1.0",
      releases: releasesPreJson,
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(result.excel!.contents));
    const sheet = wb.getWorksheet("Assets");
    expect(sheet).toBeDefined();
    const header = sheet!.getRow(1).values as readonly unknown[];
    expect([header[1], header[2], header[3], header[4], header[5]]).toEqual([
      "Name",
      "Type",
      "Value",
      "Scope",
      "Description",
    ]);
    const dataRow = sheet!.getRow(2).values as readonly unknown[];
    expect(dataRow[1]).toBe("OrchestratorUrl");
    expect(dataRow[2]).toBe("text");
    expect(dataRow[3]).toBe("https://x");
  });

  it("Excel Credentials tab includes credential names and kinds (no secret values)", async () => {
    const result = await buildConfigArtifacts({
      config,
      pinnedFrameworkVersion: "1.1.0",
      releases: releasesPreJson,
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(result.excel!.contents));
    const sheet = wb.getWorksheet("Credentials");
    const namesRow = sheet!.getRow(2).values as readonly unknown[];
    expect(namesRow[1]).toBe("ServiceAccount");
    expect(namesRow[2]).toBe("username-password");
  });

  it("throws when the pinned framework version isn't in the release list", async () => {
    await expect(
      buildConfigArtifacts({
        config,
        pinnedFrameworkVersion: "9.9.9",
        releases: releasesPreJson,
      }),
    ).rejects.toThrow();
  });
});
