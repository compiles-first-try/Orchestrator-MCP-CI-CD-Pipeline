import { describe, expect, it, vi } from "vitest";
import {
  AssetsFile,
  BucketsFile,
  ConstantsFile,
  CredentialsFile,
  OverridesFile,
  QueuesFile,
  SettingsFile,
} from "@rpa-platform/config-schema";
import type { OrchestratorClient } from "@rpa-platform/orchestrator-client";
import { ConfigOutputWriter } from "../src/writer.js";

const RESOLVE_INPUT = () => ({
  tenant: "dev" as const,
  settings: SettingsFile.parse({ schemaVersion: 1, settings: {} }),
  constants: ConstantsFile.parse({ schemaVersion: 1, constants: {} }),
  assets: AssetsFile.parse({ schemaVersion: 1, assets: [] }),
  queues: QueuesFile.parse({ schemaVersion: 1, queues: [] }),
  buckets: BucketsFile.parse({ schemaVersion: 1, buckets: [] }),
  credentials: CredentialsFile.parse({ schemaVersion: 1, credentials: [] }),
  overrides: OverridesFile.parse({ schemaVersion: 1, overrides: {} }),
});

describe("ConfigOutputWriter.writeToBucket", () => {
  it("uploads Config.json only when the framework is json-ready", async () => {
    const upload = vi.fn().mockResolvedValue(undefined);
    const orchestrator = { bucketFiles: { upload } } as unknown as OrchestratorClient;
    const writer = new ConfigOutputWriter(orchestrator, [
      { version: "2.0.0", jsonReady: true },
    ]);
    const result = await writer.writeToBucket(RESOLVE_INPUT(), "2.0.0", {
      bucketId: 99,
      folderId: 12,
    });
    expect(upload).toHaveBeenCalledTimes(1);
    expect(result.wroteLegacyExcel).toBe(false);
    const [bucketId, path, , uploadOpts] = upload.mock.calls[0] as unknown as [number, string, unknown, { contentType: string }];
    expect(bucketId).toBe(99);
    expect(path).toBe("Config.json");
    expect(uploadOpts.contentType).toBe("application/json");
  });

  it("uploads BOTH Config.json and Config.xlsx when not json-ready", async () => {
    const upload = vi.fn().mockResolvedValue(undefined);
    const orchestrator = { bucketFiles: { upload } } as unknown as OrchestratorClient;
    const writer = new ConfigOutputWriter(orchestrator, [
      { version: "1.0.0", jsonReady: false },
    ]);
    const result = await writer.writeToBucket(RESOLVE_INPUT(), "1.0.0", {
      bucketId: 99,
      folderId: 12,
    });
    expect(upload).toHaveBeenCalledTimes(2);
    expect(result.wroteLegacyExcel).toBe(true);
    const paths = upload.mock.calls.map((c) => (c as unknown as [number, string])[1]);
    expect(paths).toContain("Config.json");
    expect(paths).toContain("Config.xlsx");
  });
});
