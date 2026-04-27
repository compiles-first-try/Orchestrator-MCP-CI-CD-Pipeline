import type {
  Asset,
  AssetsApi,
  Bucket,
  BucketsApi,
  CreateAssetInput,
  CreateBucketInput,
  CreateQueueDefinitionInput,
  OperationResult,
  QueueDefinition,
  QueueDefinitionsApi,
} from "@rpa-platform/orchestrator-client";
import type { CredentialSource } from "@rpa-platform/credential-source";

export class FakeAssetsApi implements AssetsApi {
  public readonly created: CreateAssetInput[] = [];
  public readonly updated: { id: number; input: CreateAssetInput }[] = [];
  public readonly deleted: number[] = [];
  private nextId = 1000;
  constructor(public state: Asset[] = []) {}

  async list(): Promise<OperationResult<readonly Asset[]>> {
    return { data: this.state, transport: "rest_fallback" };
  }
  async get(id: number): Promise<OperationResult<Asset>> {
    const found = this.state.find((a) => a.id === id);
    if (found === undefined) throw new Error(`asset ${id} not found`);
    return { data: found, transport: "rest_fallback" };
  }
  async create(input: CreateAssetInput): Promise<OperationResult<Asset>> {
    this.created.push(input);
    const asset = inputToAsset(this.nextId++, input);
    this.state = [...this.state, asset];
    return { data: asset, transport: "rest_fallback" };
  }
  async update(id: number, input: CreateAssetInput): Promise<OperationResult<Asset>> {
    this.updated.push({ id, input });
    const asset = inputToAsset(id, input);
    this.state = this.state.map((a) => (a.id === id ? asset : a));
    return { data: asset, transport: "rest_fallback" };
  }
  async delete(id: number): Promise<OperationResult<void>> {
    this.deleted.push(id);
    this.state = this.state.filter((a) => a.id !== id);
    return { data: undefined, transport: "rest_fallback" };
  }
}

export class FailingAssetsApi extends FakeAssetsApi {
  override async create(): Promise<OperationResult<Asset>> {
    throw Object.assign(new Error("simulated 500"), { code: "orchestrator.api.error" });
  }
}

export class FakeQueuesApi implements QueueDefinitionsApi {
  public readonly created: CreateQueueDefinitionInput[] = [];
  public readonly updated: { id: number; input: CreateQueueDefinitionInput }[] = [];
  public readonly deleted: number[] = [];
  private nextId = 2000;
  constructor(public state: QueueDefinition[] = []) {}

  async list(): Promise<OperationResult<readonly QueueDefinition[]>> {
    return { data: this.state, transport: "rest_fallback" };
  }
  async get(id: number): Promise<OperationResult<QueueDefinition>> {
    const found = this.state.find((q) => q.id === id);
    if (found === undefined) throw new Error(`queue ${id} not found`);
    return { data: found, transport: "rest_fallback" };
  }
  async create(input: CreateQueueDefinitionInput): Promise<OperationResult<QueueDefinition>> {
    this.created.push(input);
    const q: QueueDefinition = {
      id: this.nextId++,
      name: input.name,
      description: input.description,
      acceptAutoRetry: input.acceptAutoRetry,
      maxRetries: input.maxRetries,
      enforceUniqueReferences: input.enforceUniqueReferences,
      slaMinutes: input.slaMinutes,
    };
    this.state = [...this.state, q];
    return { data: q, transport: "rest_fallback" };
  }
  async update(
    id: number,
    input: CreateQueueDefinitionInput,
  ): Promise<OperationResult<QueueDefinition>> {
    this.updated.push({ id, input });
    return { data: { ...input, id }, transport: "rest_fallback" };
  }
  async delete(id: number): Promise<OperationResult<void>> {
    this.deleted.push(id);
    this.state = this.state.filter((q) => q.id !== id);
    return { data: undefined, transport: "rest_fallback" };
  }
}

export class FakeBucketsApi implements BucketsApi {
  public readonly created: CreateBucketInput[] = [];
  public readonly updated: { id: number; input: CreateBucketInput }[] = [];
  public readonly deleted: number[] = [];
  private nextId = 3000;
  constructor(public state: Bucket[] = []) {}

  async list(): Promise<OperationResult<readonly Bucket[]>> {
    return { data: this.state, transport: "rest_fallback" };
  }
  async get(id: number): Promise<OperationResult<Bucket>> {
    const found = this.state.find((b) => b.id === id);
    if (found === undefined) throw new Error(`bucket ${id} not found`);
    return { data: found, transport: "rest_fallback" };
  }
  async create(input: CreateBucketInput): Promise<OperationResult<Bucket>> {
    this.created.push(input);
    const bucket: Bucket = {
      id: this.nextId++,
      name: input.name,
      description: input.description,
      storageProvider: input.storageProvider,
      storageContainer: input.storageContainer,
    };
    this.state = [...this.state, bucket];
    return { data: bucket, transport: "rest_fallback" };
  }
  async update(id: number, input: CreateBucketInput): Promise<OperationResult<Bucket>> {
    this.updated.push({ id, input });
    return {
      data: {
        id,
        name: input.name,
        description: input.description,
        storageProvider: input.storageProvider,
        storageContainer: input.storageContainer,
      },
      transport: "rest_fallback",
    };
  }
  async delete(id: number): Promise<OperationResult<void>> {
    this.deleted.push(id);
    this.state = this.state.filter((b) => b.id !== id);
    return { data: undefined, transport: "rest_fallback" };
  }
}

export class FakeCredentialSource implements CredentialSource {
  public readonly type = "manual" as const;
  private readonly values = new Map<string, string>();

  set(name: string, value: string): void {
    this.values.set(name, value);
  }

  async getValue(key: { name: string }): Promise<string> {
    const v = this.values.get(key.name);
    if (v === undefined) throw new Error(`credential ${key.name} not set`);
    return v;
  }
  async setValue(): Promise<void> {
    // not used in reconciler
  }
  async listNames(): Promise<readonly string[]> {
    return Array.from(this.values.keys());
  }
  async delete(): Promise<void> {
    // not used in reconciler
  }
}

function inputToAsset(id: number, input: CreateAssetInput): Asset {
  switch (input.value.type) {
    case "text":
      return {
        id,
        name: input.name,
        description: input.description,
        scope: input.scope,
        type: "text",
        value: input.value.value,
      };
    case "integer":
      return {
        id,
        name: input.name,
        description: input.description,
        scope: input.scope,
        type: "integer",
        value: input.value.value,
      };
    case "boolean":
      return {
        id,
        name: input.name,
        description: input.description,
        scope: input.scope,
        type: "boolean",
        value: input.value.value,
      };
    case "credential":
      return {
        id,
        name: input.name,
        description: input.description,
        scope: input.scope,
        type: "credential",
        username: input.value.username,
      };
  }
}
