import type { ZodTypeAny, infer as zodInfer } from "zod";
import { ConfigSchemaError } from "./errors.js";
import { assetsSchema, type Assets } from "./schemas/assets.js";
import { bucketsSchema, type Buckets } from "./schemas/buckets.js";
import { constantsSchema, type Constants } from "./schemas/constants.js";
import { credentialsSchema, type Credentials } from "./schemas/credentials.js";
import { overridesSchema, type Overrides } from "./schemas/overrides.js";
import { queuesSchema, type Queues } from "./schemas/queues.js";
import { settingsSchema, type Settings } from "./schemas/settings.js";

function parseWith<S extends ZodTypeAny>(file: string, schema: S, input: unknown): zodInfer<S> {
  const result = schema.safeParse(input);
  if (result.success === false) {
    throw new ConfigSchemaError(file, { issues: result.error.issues });
  }
  return result.data;
}

export function parseSettings(input: unknown): Settings {
  return parseWith("settings.json", settingsSchema, input);
}

export function parseConstants(input: unknown): Constants {
  return parseWith("constants.json", constantsSchema, input);
}

export function parseAssets(input: unknown): Assets {
  return parseWith("assets.json", assetsSchema, input);
}

export function parseQueues(input: unknown): Queues {
  return parseWith("queues.json", queuesSchema, input);
}

export function parseBuckets(input: unknown): Buckets {
  return parseWith("buckets.json", bucketsSchema, input);
}

export function parseCredentials(input: unknown): Credentials {
  return parseWith("credentials.json", credentialsSchema, input);
}

export function parseOverrides(input: unknown): Overrides {
  return parseWith("overrides.json", overridesSchema, input);
}
