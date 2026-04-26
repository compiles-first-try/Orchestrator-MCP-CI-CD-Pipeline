import type { Transport } from "../transport.js";

export interface OperationResult<T> {
  readonly data: T;
  readonly transport: Transport;
}

export type AssetScope = "Global" | "PerRobot" | "PerUser";

export type AssetInput =
  | { readonly type: "text"; readonly value: string }
  | { readonly type: "integer"; readonly value: number }
  | { readonly type: "boolean"; readonly value: boolean }
  | { readonly type: "credential"; readonly username: string; readonly password: string };

export interface CreateAssetInput {
  readonly name: string;
  readonly description?: string;
  readonly scope: AssetScope;
  readonly value: AssetInput;
}

export type Asset =
  | {
      readonly id: number;
      readonly name: string;
      readonly description: string | undefined;
      readonly scope: AssetScope;
      readonly type: "text";
      readonly value: string;
    }
  | {
      readonly id: number;
      readonly name: string;
      readonly description: string | undefined;
      readonly scope: AssetScope;
      readonly type: "integer";
      readonly value: number;
    }
  | {
      readonly id: number;
      readonly name: string;
      readonly description: string | undefined;
      readonly scope: AssetScope;
      readonly type: "boolean";
      readonly value: boolean;
    }
  | {
      readonly id: number;
      readonly name: string;
      readonly description: string | undefined;
      readonly scope: AssetScope;
      readonly type: "credential";
      readonly username: string;
    };

export interface CreateQueueDefinitionInput {
  readonly name: string;
  readonly description?: string;
  readonly acceptAutoRetry: boolean;
  readonly maxRetries: number;
  readonly enforceUniqueReferences: boolean;
  readonly slaMinutes?: number;
}

export interface QueueDefinition {
  readonly id: number;
  readonly name: string;
  readonly description: string | undefined;
  readonly acceptAutoRetry: boolean;
  readonly maxRetries: number;
  readonly enforceUniqueReferences: boolean;
  readonly slaMinutes: number | undefined;
}

export type BucketStorageProvider = "Orchestrator" | "Amazon" | "Azure";

export interface CreateBucketInput {
  readonly name: string;
  readonly description?: string;
  readonly storageProvider: BucketStorageProvider;
  readonly storageContainer?: string;
}

export interface Bucket {
  readonly id: number;
  readonly name: string;
  readonly description: string | undefined;
  readonly storageProvider: BucketStorageProvider;
  readonly storageContainer: string | undefined;
}

export interface BucketFile {
  readonly fullPath: string;
  readonly size: number;
  readonly contentType: string | undefined;
}

export interface UploadBucketFileInput {
  readonly bucketId: number;
  readonly path: string;
  readonly contentType: string;
  readonly body: Uint8Array | string;
}
