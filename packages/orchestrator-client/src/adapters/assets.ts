import type { ODataCollection, OrchestratorHttp } from "../http.js";
import type { McpClientLike, McpToolMap } from "../mcp-discovery.js";
import { chooseTransport, type Transport } from "../transport.js";
import { fromUiPathAsset, toUiPathAsset, type UiPathAsset } from "./mappers.js";
import type { Asset, CreateAssetInput, OperationResult } from "./types.js";

export interface AssetsApi {
  list(folderId?: string): Promise<OperationResult<readonly Asset[]>>;
  get(id: number, folderId?: string): Promise<OperationResult<Asset>>;
  create(input: CreateAssetInput, folderId?: string): Promise<OperationResult<Asset>>;
  update(id: number, input: CreateAssetInput, folderId?: string): Promise<OperationResult<Asset>>;
  delete(id: number, folderId?: string): Promise<OperationResult<void>>;
}

export class AssetsAdapter implements AssetsApi {
  constructor(
    private readonly http: OrchestratorHttp,
    private readonly toolMap: McpToolMap,
    private readonly mcpClient: McpClientLike | undefined,
  ) {}

  async list(folderId?: string): Promise<OperationResult<readonly Asset[]>> {
    const choice = chooseTransport(this.toolMap, "assets", "list");
    if (choice.transport === "mcp" && choice.toolName !== undefined) {
      const result = await this.callMcp(choice.toolName, {});
      const items = expectArray(result).map((entity) => fromUiPathAsset(entity as UiPathAsset));
      return { data: items, transport: "mcp" };
    }
    const response = await this.http.get<ODataCollection<UiPathAsset>>("/odata/Assets", {
      ...(folderId !== undefined ? { folderId } : {}),
    });
    return {
      data: response.value.map(fromUiPathAsset),
      transport: "rest_fallback" satisfies Transport,
    };
  }

  async get(id: number, folderId?: string): Promise<OperationResult<Asset>> {
    const choice = chooseTransport(this.toolMap, "assets", "get");
    if (choice.transport === "mcp" && choice.toolName !== undefined) {
      const result = await this.callMcp(choice.toolName, { id });
      return { data: fromUiPathAsset(result as UiPathAsset), transport: "mcp" };
    }
    const entity = await this.http.get<UiPathAsset>(`/odata/Assets(${id})`, {
      ...(folderId !== undefined ? { folderId } : {}),
    });
    return { data: fromUiPathAsset(entity), transport: "rest_fallback" };
  }

  async create(input: CreateAssetInput, folderId?: string): Promise<OperationResult<Asset>> {
    const choice = chooseTransport(this.toolMap, "assets", "create");
    if (choice.transport === "mcp" && choice.toolName !== undefined) {
      const result = await this.callMcp(choice.toolName, {
        asset: toUiPathAsset(input),
      });
      return { data: fromUiPathAsset(result as UiPathAsset), transport: "mcp" };
    }
    const created = await this.http.post<UiPathAsset>("/odata/Assets", toUiPathAsset(input), {
      ...(folderId !== undefined ? { folderId } : {}),
    });
    return { data: fromUiPathAsset(created), transport: "rest_fallback" };
  }

  async update(
    id: number,
    input: CreateAssetInput,
    folderId?: string,
  ): Promise<OperationResult<Asset>> {
    const choice = chooseTransport(this.toolMap, "assets", "update");
    if (choice.transport === "mcp" && choice.toolName !== undefined) {
      const result = await this.callMcp(choice.toolName, {
        id,
        asset: toUiPathAsset(input),
      });
      return { data: fromUiPathAsset(result as UiPathAsset), transport: "mcp" };
    }
    const updated = await this.http.put<UiPathAsset>(`/odata/Assets(${id})`, toUiPathAsset(input), {
      ...(folderId !== undefined ? { folderId } : {}),
    });
    return { data: fromUiPathAsset(updated ?? toUiPathAsset(input)), transport: "rest_fallback" };
  }

  async delete(id: number, folderId?: string): Promise<OperationResult<void>> {
    const choice = chooseTransport(this.toolMap, "assets", "delete");
    if (choice.transport === "mcp" && choice.toolName !== undefined) {
      await this.callMcp(choice.toolName, { id });
      return { data: undefined, transport: "mcp" };
    }
    await this.http.delete<void>(`/odata/Assets(${id})`, {
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

function expectArray(value: unknown): readonly unknown[] {
  if (Array.isArray(value)) return value;
  if (value !== null && typeof value === "object" && "value" in value) {
    const inner = (value as { value: unknown }).value;
    if (Array.isArray(inner)) return inner;
  }
  return [];
}
