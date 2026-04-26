import { describe, expect, it } from "vitest";
import {
  ConfigSchemaError,
  parseProjectConfig,
  validateProjectConfig,
  type ProjectConfig,
} from "../src/index.js";

const valid: ProjectConfig = {
  settings: { LogLevel: "info" },
  constants: { CompanyName: "Acme" },
  assets: [
    { name: "OrchestratorUrl", type: "text", value: "https://x", scope: "global" },
    { name: "ApiCreds", type: "credential", value: "ServiceAccount", scope: "global" },
  ],
  queues: [
    { name: "Invoices", acceptAutoRetry: false, maxRetries: 1, enforceUniqueReferences: true },
  ],
  buckets: [{ name: "Inputs", storageProvider: "orchestrator" }],
  credentials: [{ name: "ServiceAccount", kind: "username-password" }],
  overrides: {},
};

describe("parseProjectConfig", () => {
  it("accepts a fully valid config", () => {
    const result = parseProjectConfig({
      settings: valid.settings,
      constants: valid.constants,
      assets: valid.assets,
      queues: valid.queues,
      buckets: valid.buckets,
      credentials: valid.credentials,
      overrides: valid.overrides,
    });
    expect(result).toEqual(valid);
  });

  it("rejects when a credential-typed asset references an unknown credential", () => {
    expect(() =>
      parseProjectConfig({
        settings: {},
        constants: {},
        assets: [{ name: "ApiCreds", type: "credential", value: "Missing" }],
        queues: [],
        buckets: [],
        credentials: [],
        overrides: {},
      }),
    ).toThrow(ConfigSchemaError);
  });

  it("rejects when an override targets an unknown asset", () => {
    expect(() =>
      parseProjectConfig({
        settings: {},
        constants: {},
        assets: [{ name: "Real", type: "text", value: "x" }],
        queues: [],
        buckets: [],
        credentials: [],
        overrides: { assets: { Phantom: { value: "x" } } },
      }),
    ).toThrow(ConfigSchemaError);
  });

  it("rejects when any single file is invalid", () => {
    expect(() =>
      parseProjectConfig({
        settings: { "bad key": 1 },
        constants: {},
        assets: [],
        queues: [],
        buckets: [],
        credentials: [],
        overrides: {},
      }),
    ).toThrow(ConfigSchemaError);
  });

  it("attaches the spec error code", () => {
    try {
      parseProjectConfig({
        settings: {},
        constants: {},
        assets: [{ name: "ApiCreds", type: "credential", value: "Missing" }],
        queues: [],
        buckets: [],
        credentials: [],
        overrides: {},
      });
      expect.fail("expected throw");
    } catch (err) {
      expect((err as ConfigSchemaError).code).toBe("config_schema.invalid");
    }
  });
});

describe("validateProjectConfig (cross-file checks)", () => {
  it("returns no issues for a fully consistent config", () => {
    expect(validateProjectConfig(valid)).toEqual([]);
  });

  it("flags credential-asset references that don't resolve", () => {
    const issues = validateProjectConfig({
      ...valid,
      assets: [{ name: "Bad", type: "credential", value: "Nope", scope: "global" }],
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]?.path).toEqual(["assets", 0, "value"]);
  });

  it("flags overrides that don't match any asset", () => {
    const issues = validateProjectConfig({
      ...valid,
      overrides: { assets: { Ghost: { value: "x" } } },
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]?.path).toEqual(["overrides", "assets", "Ghost"]);
  });
});
