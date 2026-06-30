import { AssetsClient } from "./assets.js";
import { BucketFilesClient } from "./bucket-files.js";
import { BucketsClient } from "./buckets.js";
import { FoldersClient } from "./folders.js";
import { LibrariesClient } from "./libraries.js";
import { PackagesClient, ProcessesClient } from "./packages.js";
import { QueuesClient } from "./queues.js";
import { RestClient, type TokenSource } from "./rest-client.js";
import { TokenManager } from "./token-manager.js";
import type { TenantConnectionConfig } from "./types.js";
import { UsersClient } from "./users.js";

export interface OrchestratorClientOptions {
  // Base URL for the tenant's Orchestrator REST/OData root, e.g.
  //   https://cloud.uipath.com/{org}/{tenant}/orchestrator_
  readonly baseUrl: string;
  // Either supply pre-built configuration for the OAuth2 flow (a TokenManager
  // will be constructed), or pass a custom TokenSource (useful for tests and
  // for tenants whose token provisioning lives elsewhere).
  readonly tenantConfig?: TenantConnectionConfig;
  readonly tokenSource?: TokenSource;
  readonly fetch?: typeof fetch;
}

// Composition root. One per tenant. Holds the per-tenant TokenManager (in-
// memory token cache) and the typed entity clients sharing one RestClient.
export class OrchestratorClient {
  public readonly assets: AssetsClient;
  public readonly queues: QueuesClient;
  public readonly buckets: BucketsClient;
  public readonly bucketFiles: BucketFilesClient;
  public readonly folders: FoldersClient;
  public readonly packages: PackagesClient;
  public readonly libraries: LibrariesClient;
  public readonly processes: ProcessesClient;
  public readonly users: UsersClient;
  public readonly rest: RestClient;
  public readonly tokenSource: TokenSource;

  constructor(options: OrchestratorClientOptions) {
    if (options.tokenSource === undefined && options.tenantConfig === undefined) {
      throw new Error("OrchestratorClient requires either `tokenSource` or `tenantConfig`.");
    }
    this.tokenSource =
      options.tokenSource ??
      // Safe non-null: branch above guarantees tenantConfig is defined.
      new TokenManager(options.tenantConfig!, options.fetch === undefined ? {} : { fetch: options.fetch });
    this.rest = new RestClient({
      baseUrl: options.baseUrl,
      tokenSource: this.tokenSource,
      ...(options.fetch !== undefined && { fetch: options.fetch }),
    });
    this.assets = new AssetsClient(this.rest);
    this.queues = new QueuesClient(this.rest);
    this.buckets = new BucketsClient(this.rest);
    this.bucketFiles = new BucketFilesClient(this.rest);
    this.folders = new FoldersClient(this.rest);
    this.packages = new PackagesClient(this.rest);
    this.libraries = new LibrariesClient(this.rest);
    this.processes = new ProcessesClient(this.rest);
    this.users = new UsersClient(this.rest);
  }
}
