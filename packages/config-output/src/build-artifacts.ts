import type { ProjectConfig } from "@rpa-platform/config-schema";
import { isJsonReady, type FrameworkReleaseSummary } from "@rpa-platform/framework-version";
import { writeConfigExcel } from "./excel-writer.js";
import { writeConfigJson } from "./json-writer.js";

export interface BuildArtifactsParams {
  readonly config: ProjectConfig;
  readonly pinnedFrameworkVersion: string;
  readonly releases: readonly FrameworkReleaseSummary[];
  readonly generatedAt?: Date;
}

export interface BuildArtifactsResult {
  readonly json: { readonly fileName: string; readonly contents: string };
  readonly excel: { readonly fileName: string; readonly contents: Uint8Array } | undefined;
}

const JSON_FILE_NAME = "Config.json";
const EXCEL_FILE_NAME = "Config.xlsx";

export async function buildConfigArtifacts(
  params: BuildArtifactsParams,
): Promise<BuildArtifactsResult> {
  const generatedAt = params.generatedAt ?? new Date();
  const json = writeConfigJson(params.config, {
    frameworkVersion: params.pinnedFrameworkVersion,
    generatedAt: generatedAt.toISOString(),
  });
  const jsonReady = isJsonReady(params.pinnedFrameworkVersion, params.releases);
  if (jsonReady) {
    return {
      json: { fileName: JSON_FILE_NAME, contents: json },
      excel: undefined,
    };
  }
  const excelBytes = await writeConfigExcel(params.config);
  return {
    json: { fileName: JSON_FILE_NAME, contents: json },
    excel: { fileName: EXCEL_FILE_NAME, contents: excelBytes },
  };
}
