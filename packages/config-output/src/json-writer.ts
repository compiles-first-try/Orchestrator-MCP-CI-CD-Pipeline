import type { ProjectConfig } from "@rpa-platform/config-schema";

export interface JsonWriterMeta {
  readonly frameworkVersion: string;
  readonly generatedAt: string;
}

export function writeConfigJson(config: ProjectConfig, meta: JsonWriterMeta): string {
  const payload = {
    _meta: {
      frameworkVersion: meta.frameworkVersion,
      generatedAt: meta.generatedAt,
    },
    settings: config.settings,
    constants: config.constants,
    assets: config.assets,
    queues: config.queues,
    buckets: config.buckets,
    credentials: config.credentials,
    overrides: config.overrides,
  };
  return JSON.stringify(payload, null, 2) + "\n";
}
