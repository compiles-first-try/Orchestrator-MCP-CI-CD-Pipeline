import { describe, expect, it } from "vitest";
import {
  AssetsFile,
  BucketsFile,
  ConstantsFile,
  CredentialsFile,
  OverridesFile,
  QueuesFile,
  SettingsFile,
} from "@rpa-platform/config-schema";
import { resolveConfig } from "../src/resolve.js";

const BASE_INPUT = () => ({
  tenant: "test" as const,
  settings: SettingsFile.parse({
    schemaVersion: 1,
    settings: { MaxRetryNumber: 3, OrchestratorAlertsEmail: "ops@example.com" },
  }),
  constants: ConstantsFile.parse({
    schemaVersion: 1,
    constants: { FrameworkVersion: "2.0.0" },
  }),
  assets: AssetsFile.parse({
    schemaVersion: 1,
    assets: [{ name: "ApiUrl", type: "text", value: "https://api.example.com" }],
  }),
  queues: QueuesFile.parse({
    schemaVersion: 1,
    queues: [{ name: "Orders" }],
  }),
  buckets: BucketsFile.parse({
    schemaVersion: 1,
    buckets: [{ name: "config" }],
  }),
  credentials: CredentialsFile.parse({
    schemaVersion: 1,
    credentials: [{ name: "DbPassword", secretSource: "manual", secretRef: "manual-key-1" }],
  }),
});

describe("resolveConfig", () => {
  it("returns the base config when no overrides apply", () => {
    const input = { ...BASE_INPUT(), overrides: OverridesFile.parse({ schemaVersion: 1, overrides: {} }) };
    const result = resolveConfig(input);
    expect(result.settings).toEqual({ MaxRetryNumber: 3, OrchestratorAlertsEmail: "ops@example.com" });
    expect(result.assets[0]?.value).toBe("https://api.example.com");
  });

  it("merges per-tenant settings overrides", () => {
    const overrides = OverridesFile.parse({
      schemaVersion: 1,
      overrides: { test: { settings: { MaxRetryNumber: 5 } } },
    });
    const result = resolveConfig({ ...BASE_INPUT(), overrides });
    expect(result.settings).toMatchObject({ MaxRetryNumber: 5, OrchestratorAlertsEmail: "ops@example.com" });
  });

  it("treats a settings override of null as a deletion", () => {
    const overrides = OverridesFile.parse({
      schemaVersion: 1,
      overrides: { test: { settings: { OrchestratorAlertsEmail: null } } },
    });
    const result = resolveConfig({ ...BASE_INPUT(), overrides });
    expect("OrchestratorAlertsEmail" in result.settings).toBe(false);
    expect(result.settings).toMatchObject({ MaxRetryNumber: 3 });
  });

  it("merges per-tenant entity field overrides without disturbing other entities", () => {
    const overrides = OverridesFile.parse({
      schemaVersion: 1,
      overrides: {
        test: {
          assets: { ApiUrl: { value: "https://test-api.example.com" } },
          queues: { Orders: { maxRetries: 10 } },
        },
      },
    });
    const result = resolveConfig({ ...BASE_INPUT(), overrides });
    expect(result.assets[0]?.value).toBe("https://test-api.example.com");
    expect(result.queues[0]?.maxRetries).toBe(10);
  });

  it("ignores overrides for a different tenant", () => {
    const overrides = OverridesFile.parse({
      schemaVersion: 1,
      overrides: { prod: { settings: { MaxRetryNumber: 99 } } },
    });
    const result = resolveConfig({ ...BASE_INPUT(), overrides });
    expect(result.settings).toMatchObject({ MaxRetryNumber: 3 });
  });
});
