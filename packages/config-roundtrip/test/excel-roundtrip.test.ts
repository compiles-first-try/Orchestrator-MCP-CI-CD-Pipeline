import { describe, expect, it } from "vitest";
import type { ProjectConfig } from "@rpa-platform/config-schema";
import {
  exportProjectConfigsToExcel,
  importProjectConfigsFromExcel,
  type TenantConfigs,
} from "../src/index.js";

function baseConfig(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    settings: {},
    constants: {},
    assets: [],
    queues: [],
    buckets: [],
    credentials: [],
    overrides: {},
    ...overrides,
  };
}

describe("exportProjectConfigsToExcel + importProjectConfigsFromExcel", () => {
  it("round-trips Settings values across all four tenants", async () => {
    const perTenant: TenantConfigs = {
      dev: baseConfig({ settings: { LogLevel: "debug", MaxRows: 10 } }),
      test: baseConfig({ settings: { LogLevel: "info", MaxRows: 100 } }),
      stage: baseConfig({ settings: { LogLevel: "warn", MaxRows: 500 } }),
      prod: baseConfig({ settings: { LogLevel: "error", MaxRows: 1000 } }),
    };
    const bytes = await exportProjectConfigsToExcel(perTenant);
    const restored = await importProjectConfigsFromExcel(bytes, perTenant);
    expect(restored.dev.settings).toEqual({ LogLevel: "debug", MaxRows: 10 });
    expect(restored.prod.settings).toEqual({ LogLevel: "error", MaxRows: 1000 });
  });

  it("round-trips Constants the same way as Settings", async () => {
    const perTenant: TenantConfigs = {
      dev: baseConfig({ constants: { CompanyName: "Acme" } }),
      test: baseConfig({ constants: { CompanyName: "Acme" } }),
      stage: baseConfig({ constants: { CompanyName: "Acme" } }),
      prod: baseConfig({ constants: { CompanyName: "Acme" } }),
    };
    const bytes = await exportProjectConfigsToExcel(perTenant);
    const restored = await importProjectConfigsFromExcel(bytes, perTenant);
    expect(restored.dev.constants).toEqual({ CompanyName: "Acme" });
  });

  it("round-trips Asset values per tenant while preserving type+scope", async () => {
    const makeWith = (devValue: string, prodValue: string): ProjectConfig =>
      baseConfig({
        assets: [{ name: "OrchestratorUrl", type: "text", value: devValue, scope: "global" }],
      });
    const perTenant: TenantConfigs = {
      dev: makeWith("https://dev.x", "_"),
      test: baseConfig({
        assets: [
          { name: "OrchestratorUrl", type: "text", value: "https://test.x", scope: "global" },
        ],
      }),
      stage: baseConfig({
        assets: [
          { name: "OrchestratorUrl", type: "text", value: "https://stage.x", scope: "global" },
        ],
      }),
      prod: baseConfig({
        assets: [
          { name: "OrchestratorUrl", type: "text", value: "https://prod.x", scope: "global" },
        ],
      }),
    };
    const bytes = await exportProjectConfigsToExcel(perTenant);
    const restored = await importProjectConfigsFromExcel(bytes, perTenant);
    expect(restored.dev.assets[0]).toMatchObject({ value: "https://dev.x", type: "text" });
    expect(restored.prod.assets[0]).toMatchObject({ value: "https://prod.x", type: "text" });
  });

  it("preserves integer and boolean asset types on round-trip", async () => {
    const perTenant: TenantConfigs = {
      dev: baseConfig({
        assets: [
          { name: "MaxRows", type: "integer", value: 5, scope: "global" },
          { name: "Flag", type: "boolean", value: true, scope: "global" },
        ],
      }),
      test: baseConfig({
        assets: [
          { name: "MaxRows", type: "integer", value: 50, scope: "global" },
          { name: "Flag", type: "boolean", value: false, scope: "global" },
        ],
      }),
      stage: baseConfig({
        assets: [
          { name: "MaxRows", type: "integer", value: 500, scope: "global" },
          { name: "Flag", type: "boolean", value: true, scope: "global" },
        ],
      }),
      prod: baseConfig({
        assets: [
          { name: "MaxRows", type: "integer", value: 5000, scope: "global" },
          { name: "Flag", type: "boolean", value: false, scope: "global" },
        ],
      }),
    };
    const bytes = await exportProjectConfigsToExcel(perTenant);
    const restored = await importProjectConfigsFromExcel(bytes, perTenant);
    const devMax = restored.dev.assets.find((a) => a.name === "MaxRows");
    const devFlag = restored.dev.assets.find((a) => a.name === "Flag");
    expect(devMax).toMatchObject({ type: "integer", value: 5 });
    expect(devFlag).toMatchObject({ type: "boolean", value: true });
    const prodFlag = restored.prod.assets.find((a) => a.name === "Flag");
    expect(prodFlag).toMatchObject({ type: "boolean", value: false });
  });

  it("preserves credential asset references (no secrets in Excel)", async () => {
    const perTenant: TenantConfigs = {
      dev: baseConfig({
        assets: [
          { name: "ApiCreds", type: "credential", value: "ServiceAccount", scope: "global" },
        ],
      }),
      test: baseConfig({
        assets: [
          { name: "ApiCreds", type: "credential", value: "ServiceAccount", scope: "global" },
        ],
      }),
      stage: baseConfig({
        assets: [
          { name: "ApiCreds", type: "credential", value: "ServiceAccount", scope: "global" },
        ],
      }),
      prod: baseConfig({
        assets: [
          { name: "ApiCreds", type: "credential", value: "ServiceAccount", scope: "global" },
        ],
      }),
    };
    const bytes = await exportProjectConfigsToExcel(perTenant);
    const restored = await importProjectConfigsFromExcel(bytes, perTenant);
    expect(restored.dev.assets[0]).toMatchObject({
      type: "credential",
      value: "ServiceAccount",
    });
  });

  it("passes Queues, Buckets, Credentials, and Overrides through unchanged", async () => {
    const passthrough = baseConfig({
      queues: [{ name: "Q", acceptAutoRetry: false, maxRetries: 1, enforceUniqueReferences: true }],
      buckets: [{ name: "B", storageProvider: "orchestrator" }],
      credentials: [{ name: "ServiceAccount", kind: "username-password" }],
      overrides: { assets: { OrchestratorUrl: { value: "https://override.x" } } },
    });
    const perTenant: TenantConfigs = {
      dev: passthrough,
      test: passthrough,
      stage: passthrough,
      prod: passthrough,
    };
    const bytes = await exportProjectConfigsToExcel(perTenant);
    const restored = await importProjectConfigsFromExcel(bytes, perTenant);
    expect(restored.dev.queues).toEqual(passthrough.queues);
    expect(restored.dev.buckets).toEqual(passthrough.buckets);
    expect(restored.dev.credentials).toEqual(passthrough.credentials);
    expect(restored.dev.overrides).toEqual(passthrough.overrides);
  });
});
