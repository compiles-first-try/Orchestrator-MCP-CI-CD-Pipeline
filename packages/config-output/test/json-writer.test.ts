import { describe, expect, it } from "vitest";
import { writeConfigJson } from "../src/json-writer.js";
import type { ResolvedConfig } from "../src/resolve.js";

const SAMPLE: ResolvedConfig = {
  tenant: "dev",
  settings: { Z_SETTING: "z", A_SETTING: "a" },
  constants: { B_CONST: "b" },
  assets: [
    { name: "Beta", type: "text", value: "b" },
    { name: "Alpha", type: "text", value: "a" },
  ],
  queues: [{ name: "Q", autoRetry: false, maxRetries: 3, uniqueReference: false, encrypted: false }],
  buckets: [{ name: "config", provider: "orchestrator" }],
  credentials: [{ name: "DbPassword", kind: "credential", secretSource: "manual", secretRef: "k1" }],
};

describe("writeConfigJson", () => {
  it("emits a JSON string with stable key + array order", () => {
    const json = writeConfigJson(SAMPLE);
    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.tenant).toBe("dev");
    expect(Object.keys(parsed.settings as Record<string, unknown>)).toEqual(["A_SETTING", "Z_SETTING"]);
    expect((parsed.assets as { name: string }[]).map((a) => a.name)).toEqual(["Alpha", "Beta"]);
  });

  it("produces byte-identical output for two calls with the same input", () => {
    const a = writeConfigJson(SAMPLE);
    const b = writeConfigJson(SAMPLE);
    expect(a).toBe(b);
  });

  it("ends with a trailing newline", () => {
    expect(writeConfigJson(SAMPLE).endsWith("\n")).toBe(true);
  });
});
