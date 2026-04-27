export {
  OrchestratorAuthError,
  OrchestratorTransportError,
  OrchestratorApiError,
} from "./errors.js";
export {
  encryptSecret,
  decryptSecret,
  parseEncryptionKey,
  EncryptionError,
} from "@rpa-platform/shared";
export { TokenManager, type TokenManagerConfig, type FetchFn } from "./token-manager.js";
export {
  OrchestratorHttp,
  type OrchestratorHttpConfig,
  type RequestOptions,
  type ODataCollection,
} from "./http.js";
export {
  discoverMcpTools,
  McpToolMap,
  RESOURCES,
  OPS,
  type McpClientLike,
  type McpClientFactory,
  type McpToolDescriptor,
  type DiscoveryResult,
  type DiscoveryOptions,
  type ResourceKey,
  type OpKey,
} from "./mcp-discovery.js";
export { chooseTransport, type Transport, type TransportChoice } from "./transport.js";
export { OrchestratorClient, type OrchestratorClientConfig } from "./client.js";
export type {
  Asset,
  AssetInput,
  AssetScope,
  CreateAssetInput,
  Bucket,
  BucketFile,
  BucketStorageProvider,
  CreateBucketInput,
  CreateQueueDefinitionInput,
  OperationResult,
  QueueDefinition,
  UploadBucketFileInput,
} from "./adapters/types.js";
export type { AssetsApi } from "./adapters/assets.js";
export type { BucketFilesApi } from "./adapters/bucket-files.js";
export type { BucketsApi } from "./adapters/buckets.js";
export type { QueueDefinitionsApi } from "./adapters/queue-definitions.js";
