import { AssetsAdapter, type AssetsApi } from "./adapters/assets.js";
import { BucketFilesAdapter, type BucketFilesApi } from "./adapters/bucket-files.js";
import { BucketsAdapter, type BucketsApi } from "./adapters/buckets.js";
import { QueueDefinitionsAdapter, type QueueDefinitionsApi } from "./adapters/queue-definitions.js";
import { OrchestratorHttp } from "./http.js";
import {
  discoverMcpTools,
  McpToolMap,
  type DiscoveryOptions,
  type McpClientFactory,
  type McpClientLike,
} from "./mcp-discovery.js";
import type { FetchFn, TokenManager } from "./token-manager.js";

export interface OrchestratorClientConfig {
  readonly orchestratorUrl: string;
  readonly tokenManager: TokenManager;
  readonly fetch?: FetchFn;
  readonly folderId?: string;
  readonly mcpUrl?: string;
  readonly mcpFactory?: McpClientFactory;
  readonly mcpOnFailure?: DiscoveryOptions["onFailure"];
}

export class OrchestratorClient {
  public assets: AssetsApi;
  public queueDefinitions: QueueDefinitionsApi;
  public buckets: BucketsApi;
  public bucketFiles: BucketFilesApi;

  private readonly http: OrchestratorHttp;
  private readonly fetchFn: FetchFn;
  private readonly mcpUrl: string | undefined;
  private readonly mcpFactory: McpClientFactory | undefined;
  private readonly mcpOnFailure: DiscoveryOptions["onFailure"];
  private toolMap: McpToolMap;
  private mcpClient: McpClientLike | undefined;
  private mcpClose: (() => Promise<void>) | undefined;

  constructor(config: OrchestratorClientConfig) {
    this.fetchFn = config.fetch ?? globalThis.fetch;
    this.http = new OrchestratorHttp({
      baseUrl: config.orchestratorUrl,
      tokenManager: config.tokenManager,
      fetch: this.fetchFn,
      ...(config.folderId !== undefined ? { folderId: config.folderId } : {}),
    });

    this.mcpUrl = config.mcpUrl;
    this.mcpFactory = config.mcpFactory;
    this.mcpOnFailure = config.mcpOnFailure ?? "throw";
    this.toolMap = new McpToolMap([]);

    this.assets = new AssetsAdapter(this.http, this.toolMap, undefined);
    this.queueDefinitions = new QueueDefinitionsAdapter(this.http, this.toolMap, undefined);
    this.buckets = new BucketsAdapter(this.http, this.toolMap, undefined);
    this.bucketFiles = new BucketFilesAdapter(this.http, this.fetchFn, this.toolMap, undefined);
  }

  async init(): Promise<void> {
    if (this.mcpUrl === undefined) return;
    const discovery = await discoverMcpTools(this.mcpUrl, {
      ...(this.mcpFactory !== undefined ? { factory: this.mcpFactory } : {}),
      ...(this.mcpOnFailure !== undefined ? { onFailure: this.mcpOnFailure } : {}),
    });
    this.toolMap = discovery.toolMap;
    this.mcpClose = discovery.close;
    if (this.toolMap.size() === 0) {
      this.rebuildAdapters();
      return;
    }
    if (this.mcpFactory !== undefined) {
      this.mcpClient = await this.mcpFactory(this.mcpUrl);
    }
    this.rebuildAdapters();
  }

  async shutdown(): Promise<void> {
    if (this.mcpClient !== undefined) {
      await safeClose(this.mcpClient);
      this.mcpClient = undefined;
    }
    if (this.mcpClose !== undefined) {
      await this.mcpClose();
      this.mcpClose = undefined;
    }
  }

  private rebuildAdapters(): void {
    this.assets = new AssetsAdapter(this.http, this.toolMap, this.mcpClient);
    this.queueDefinitions = new QueueDefinitionsAdapter(this.http, this.toolMap, this.mcpClient);
    this.buckets = new BucketsAdapter(this.http, this.toolMap, this.mcpClient);
    this.bucketFiles = new BucketFilesAdapter(
      this.http,
      this.fetchFn,
      this.toolMap,
      this.mcpClient,
    );
  }
}

async function safeClose(client: McpClientLike): Promise<void> {
  try {
    await client.close();
  } catch {
    // Best-effort.
  }
}
