import type {
  Asset,
  AssetScope,
  Bucket,
  BucketFile,
  BucketStorageProvider,
  CreateAssetInput,
  CreateBucketInput,
  CreateQueueDefinitionInput,
  QueueDefinition,
} from "./types.js";

export interface UiPathAsset {
  readonly Id?: number;
  readonly Name: string;
  readonly Description?: string;
  readonly ValueScope: AssetScope;
  readonly ValueType: "Text" | "Bool" | "Integer" | "Credential";
  readonly StringValue?: string;
  readonly BoolValue?: boolean;
  readonly IntValue?: number;
  readonly CredentialUsername?: string;
  readonly CredentialPassword?: string;
}

export function toUiPathAsset(input: CreateAssetInput): UiPathAsset {
  const base = {
    Name: input.name,
    ValueScope: input.scope,
    ...(input.description !== undefined ? { Description: input.description } : {}),
  };
  switch (input.value.type) {
    case "text":
      return { ...base, ValueType: "Text", StringValue: input.value.value };
    case "integer":
      return { ...base, ValueType: "Integer", IntValue: input.value.value };
    case "boolean":
      return { ...base, ValueType: "Bool", BoolValue: input.value.value };
    case "credential":
      return {
        ...base,
        ValueType: "Credential",
        CredentialUsername: input.value.username,
        CredentialPassword: input.value.password,
      };
  }
}

export function fromUiPathAsset(entity: UiPathAsset): Asset {
  const id = entity.Id ?? 0;
  const description = entity.Description;
  switch (entity.ValueType) {
    case "Text":
      return {
        id,
        name: entity.Name,
        description,
        scope: entity.ValueScope,
        type: "text",
        value: entity.StringValue ?? "",
      };
    case "Integer":
      return {
        id,
        name: entity.Name,
        description,
        scope: entity.ValueScope,
        type: "integer",
        value: entity.IntValue ?? 0,
      };
    case "Bool":
      return {
        id,
        name: entity.Name,
        description,
        scope: entity.ValueScope,
        type: "boolean",
        value: entity.BoolValue ?? false,
      };
    case "Credential":
      return {
        id,
        name: entity.Name,
        description,
        scope: entity.ValueScope,
        type: "credential",
        username: entity.CredentialUsername ?? "",
      };
  }
}

export interface UiPathQueueDefinition {
  readonly Id?: number;
  readonly Name: string;
  readonly Description?: string;
  readonly MaxNumberOfRetries: number;
  readonly AcceptAutomaticallyRetry: boolean;
  readonly EnforceUniqueReference: boolean;
  readonly SlaInMinutes?: number;
}

export function toUiPathQueueDefinition(input: CreateQueueDefinitionInput): UiPathQueueDefinition {
  return {
    Name: input.name,
    ...(input.description !== undefined ? { Description: input.description } : {}),
    MaxNumberOfRetries: input.maxRetries,
    AcceptAutomaticallyRetry: input.acceptAutoRetry,
    EnforceUniqueReference: input.enforceUniqueReferences,
    ...(input.slaMinutes !== undefined ? { SlaInMinutes: input.slaMinutes } : {}),
  };
}

export function fromUiPathQueueDefinition(entity: UiPathQueueDefinition): QueueDefinition {
  return {
    id: entity.Id ?? 0,
    name: entity.Name,
    description: entity.Description,
    acceptAutoRetry: entity.AcceptAutomaticallyRetry,
    maxRetries: entity.MaxNumberOfRetries,
    enforceUniqueReferences: entity.EnforceUniqueReference,
    slaMinutes: entity.SlaInMinutes,
  };
}

export interface UiPathBucket {
  readonly Id?: number;
  readonly Name: string;
  readonly Description?: string;
  readonly StorageProvider?: BucketStorageProvider;
  readonly StorageContainer?: string;
}

export function toUiPathBucket(input: CreateBucketInput): UiPathBucket {
  return {
    Name: input.name,
    ...(input.description !== undefined ? { Description: input.description } : {}),
    StorageProvider: input.storageProvider,
    ...(input.storageContainer !== undefined ? { StorageContainer: input.storageContainer } : {}),
  };
}

export function fromUiPathBucket(entity: UiPathBucket): Bucket {
  return {
    id: entity.Id ?? 0,
    name: entity.Name,
    description: entity.Description,
    storageProvider: entity.StorageProvider ?? "Orchestrator",
    storageContainer: entity.StorageContainer,
  };
}

export interface UiPathBucketFile {
  readonly FullPath: string;
  readonly Size: number;
  readonly ContentType?: string;
}

export function fromUiPathBucketFile(entity: UiPathBucketFile): BucketFile {
  return {
    fullPath: entity.FullPath,
    size: entity.Size,
    contentType: entity.ContentType,
  };
}
