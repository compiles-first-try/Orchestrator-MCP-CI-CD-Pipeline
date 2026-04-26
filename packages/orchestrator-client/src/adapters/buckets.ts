import type { ODataCollection, OrchestratorHttp } from "../http.js";
import type { McpClientLike, McpToolMap } from "../mcp-discovery.js";
import { chooseTransport } from "../transport.js";
import { fromUiPathBucket, toUiPathBucket, type UiPathBucket } from "./mappers.js";
import type { Bucket, CreateBucketInput, OperationResult } from "./types.js";

export interface BucketsApi {
  list(folderId?: string): Promise<OperationResult<readonly Bucket[]>>;
  get(id: number, folderId?: string): Promise<OperationResult<Bucket>>;
  create(input: CreateBucketInput, folderId?: string): Promise<OperationResult<Bucket>>;
  update(id: number, input: CreateBucketInput, folderId?: string): Promise<OperationResult<Bucket>>;
  delete(id: number, folderId?: string): Promise<OperationResult<void>>;
}

export class BucketsAdapter implements BucketsApi {
  constructor(
    private readonly http: OrchestratorHttp,
    private readonly toolMap: McpToolMap,
    private readonly mcpClient: McpClientLike | undefined,
  ) {}

  async list(folderId?: string): Promise<OperationResult<readonly Bucket[]>> {
    const choice = chooseTransport(this.toolMap, "buckets", "list");
    if (choice.transport === "mcp" && choice.toolName !== undefined) {
      const result = await this.callMcp(choice.toolName, {});
      const items = (Array.isArray(result) ? result : []).map((entity) =>
        fromUiPathBucket(entity as UiPathBucket),
      );
      return { data: items, transport: "mcp" };
    }
    const response = await this.http.get<ODataCollection<UiPathBucket>>("/odata/Buckets", {
      ...(folderId !== undefined ? { folderId } : {}),
    });
    return { data: response.value.map(fromUiPathBucket), transport: "rest_fallback" };
  }

  async get(id: number, folderId?: string): Promise<OperationResult<Bucket>> {
    const choice = chooseTransport(this.toolMap, "buckets", "get");
    if (choice.transport === "mcp" && choice.toolName !== undefined) {
      const result = await this.callMcp(choice.toolName, { id });
      return { data: fromUiPathBucket(result as UiPathBucket), transport: "mcp" };
    }
    const entity = await this.http.get<UiPathBucket>(`/odata/Buckets(${id})`, {
      ...(folderId !== undefined ? { folderId } : {}),
    });
    return { data: fromUiPathBucket(entity), transport: "rest_fallback" };
  }

  async create(input: CreateBucketInput, folderId?: string): Promise<OperationResult<Bucket>> {
    const choice = chooseTransport(this.toolMap, "buckets", "create");
    if (choice.transport === "mcp" && choice.toolName !== undefined) {
      const result = await this.callMcp(choice.toolName, { bucket: toUiPathBucket(input) });
      return { data: fromUiPathBucket(result as UiPathBucket), transport: "mcp" };
    }
    const created = await this.http.post<UiPathBucket>("/odata/Buckets", toUiPathBucket(input), {
      ...(folderId !== undefined ? { folderId } : {}),
    });
    return { data: fromUiPathBucket(created), transport: "rest_fallback" };
  }

  async update(
    id: number,
    input: CreateBucketInput,
    folderId?: string,
  ): Promise<OperationResult<Bucket>> {
    const choice = chooseTransport(this.toolMap, "buckets", "update");
    if (choice.transport === "mcp" && choice.toolName !== undefined) {
      const result = await this.callMcp(choice.toolName, {
        id,
        bucket: toUiPathBucket(input),
      });
      return { data: fromUiPathBucket(result as UiPathBucket), transport: "mcp" };
    }
    const updated = await this.http.put<UiPathBucket>(
      `/odata/Buckets(${id})`,
      toUiPathBucket(input),
      { ...(folderId !== undefined ? { folderId } : {}) },
    );
    return { data: fromUiPathBucket(updated ?? toUiPathBucket(input)), transport: "rest_fallback" };
  }

  async delete(id: number, folderId?: string): Promise<OperationResult<void>> {
    const choice = chooseTransport(this.toolMap, "buckets", "delete");
    if (choice.transport === "mcp" && choice.toolName !== undefined) {
      await this.callMcp(choice.toolName, { id });
      return { data: undefined, transport: "mcp" };
    }
    await this.http.delete<void>(`/odata/Buckets(${id})`, {
      ...(folderId !== undefined ? { folderId } : {}),
    });
    return { data: undefined, transport: "rest_fallback" };
  }

  private async callMcp(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (this.mcpClient === undefined) {
      throw new Error(`MCP tool '${name}' is in the discovery map but no MCP client is configured`);
    }
    return this.mcpClient.callTool(name, args);
  }
}
