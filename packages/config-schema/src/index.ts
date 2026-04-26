export { ConfigSchemaError, type ConfigSchemaErrorOptions } from "./errors.js";
export { NAME_PATTERN, nameSchema, descriptionSchema, uniqueByName } from "./common.js";

export {
  settingsSchema,
  settingValueSchema,
  type Settings,
  type SettingValue,
} from "./schemas/settings.js";
export { constantsSchema, type Constants } from "./schemas/constants.js";
export {
  assetsSchema,
  assetSchema,
  ASSET_TYPES,
  ASSET_SCOPES,
  type Asset,
  type Assets,
  type AssetType,
  type AssetScope,
} from "./schemas/assets.js";
export { queuesSchema, queueSchema, type Queue, type Queues } from "./schemas/queues.js";
export {
  bucketsSchema,
  bucketSchema,
  BUCKET_PROVIDERS,
  type Bucket,
  type Buckets,
  type BucketProvider,
} from "./schemas/buckets.js";
export {
  credentialsSchema,
  credentialSchema,
  CREDENTIAL_KINDS,
  type Credential,
  type Credentials,
  type CredentialKind,
} from "./schemas/credentials.js";
export { overridesSchema, type AssetValueOverride, type Overrides } from "./schemas/overrides.js";

export {
  parseProjectConfig,
  validateProjectConfig,
  type ProjectConfig,
  type ProjectConfigInput,
} from "./project-config.js";

export {
  parseSettings,
  parseConstants,
  parseAssets,
  parseQueues,
  parseBuckets,
  parseCredentials,
  parseOverrides,
} from "./parse.js";
