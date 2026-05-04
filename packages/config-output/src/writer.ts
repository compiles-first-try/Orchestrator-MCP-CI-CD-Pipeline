import {
  isJsonReady,
  type FrameworkReleaseLookup,
} from "@rpa-platform/framework-version";
import type { OrchestratorClient } from "@rpa-platform/orchestrator-client";
import { writeConfigJson } from "./json-writer.js";
import { writeConfigXlsx } from "./excel-writer.js";
import { resolveConfig, type ResolveInput, type ResolvedConfig } from "./resolve.js";

export interface WriteToBucketOptions {
  readonly bucketId: number;
  readonly folderId: string | number;
  // Filenames inside the bucket. Defaults match the spec's documented filenames.
  readonly jsonPath?: string;
  readonly xlsxPath?: string;
}

export interface WriteToBucketResult {
  readonly jsonBytes: number;
  readonly xlsxBytes: number | undefined;
  readonly wroteLegacyExcel: boolean;
}

// Top-level writer used by the reconciler. Resolves overrides for the target
// tenant, serialises the merged config, and uploads to the project's
// Orchestrator Bucket. Writes the legacy Excel companion only when the
// pinned framework version is not json-ready.
export class ConfigOutputWriter {
  readonly #orchestrator: OrchestratorClient;
  readonly #releases: readonly FrameworkReleaseLookup[];

  constructor(orchestrator: OrchestratorClient, releases: readonly FrameworkReleaseLookup[]) {
    this.#orchestrator = orchestrator;
    this.#releases = releases;
  }

  resolve(input: ResolveInput): ResolvedConfig {
    return resolveConfig(input);
  }

  async writeToBucket(
    input: ResolveInput,
    pinnedFrameworkVersion: string,
    options: WriteToBucketOptions,
  ): Promise<WriteToBucketResult> {
    const resolved = resolveConfig(input);
    const jsonBody = writeConfigJson(resolved);
    const jsonBytes = Buffer.byteLength(jsonBody, "utf8");
    const jsonPath = options.jsonPath ?? "Config.json";

    await this.#orchestrator.bucketFiles.upload(options.bucketId, jsonPath, jsonBody, {
      contentType: "application/json",
      folder: { folderId: options.folderId },
    });

    const ready = isJsonReady(pinnedFrameworkVersion, this.#releases);
    if (ready) {
      return { jsonBytes, xlsxBytes: undefined, wroteLegacyExcel: false };
    }

    const xlsxBody = await writeConfigXlsx(resolved);
    const xlsxPath = options.xlsxPath ?? "Config.xlsx";
    await this.#orchestrator.bucketFiles.upload(options.bucketId, xlsxPath, xlsxBody, {
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      folder: { folderId: options.folderId },
    });

    return { jsonBytes, xlsxBytes: xlsxBody.byteLength, wroteLegacyExcel: true };
  }
}
