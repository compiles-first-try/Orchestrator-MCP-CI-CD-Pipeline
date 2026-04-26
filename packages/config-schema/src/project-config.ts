import { z } from "zod";
import { ConfigSchemaError } from "./errors.js";
import { assetsSchema, type Assets } from "./schemas/assets.js";
import { bucketsSchema, type Buckets } from "./schemas/buckets.js";
import { constantsSchema, type Constants } from "./schemas/constants.js";
import { credentialsSchema, type Credentials } from "./schemas/credentials.js";
import { overridesSchema, type Overrides } from "./schemas/overrides.js";
import { queuesSchema, type Queues } from "./schemas/queues.js";
import { settingsSchema, type Settings } from "./schemas/settings.js";

export interface ProjectConfig {
  readonly settings: Settings;
  readonly constants: Constants;
  readonly assets: Assets;
  readonly queues: Queues;
  readonly buckets: Buckets;
  readonly credentials: Credentials;
  readonly overrides: Overrides;
}

export interface ProjectConfigInput {
  readonly settings: unknown;
  readonly constants: unknown;
  readonly assets: unknown;
  readonly queues: unknown;
  readonly buckets: unknown;
  readonly credentials: unknown;
  readonly overrides: unknown;
}

const projectConfigShapeSchema = z.object({
  settings: settingsSchema,
  constants: constantsSchema,
  assets: assetsSchema,
  queues: queuesSchema,
  buckets: bucketsSchema,
  credentials: credentialsSchema,
  overrides: overridesSchema,
});

export function parseProjectConfig(input: ProjectConfigInput): ProjectConfig {
  const shape = projectConfigShapeSchema.safeParse(input);
  if (shape.success === false) {
    throw new ConfigSchemaError("project-config", { issues: shape.error.issues });
  }
  const cross = validateProjectConfig(shape.data);
  if (cross.length > 0) {
    throw new ConfigSchemaError("project-config", { issues: cross });
  }
  return shape.data;
}

export function validateProjectConfig(config: ProjectConfig): readonly z.ZodIssue[] {
  const issues: z.ZodIssue[] = [];
  const credentialNames = new Set(config.credentials.map((c) => c.name));
  const assetNames = new Set(config.assets.map((a) => a.name));

  for (let i = 0; i < config.assets.length; i += 1) {
    const asset = config.assets[i];
    if (asset === undefined) continue;
    if (asset.type === "credential" && credentialNames.has(asset.value) === false) {
      issues.push({
        code: z.ZodIssueCode.custom,
        path: ["assets", i, "value"],
        message: `asset '${asset.name}' references unknown credential '${asset.value}'`,
      });
    }
  }

  if (config.overrides.assets !== undefined) {
    for (const [overrideName] of Object.entries(config.overrides.assets)) {
      if (assetNames.has(overrideName) === false) {
        issues.push({
          code: z.ZodIssueCode.custom,
          path: ["overrides", "assets", overrideName],
          message: `override targets unknown asset '${overrideName}'`,
        });
      }
    }
  }

  return issues;
}
