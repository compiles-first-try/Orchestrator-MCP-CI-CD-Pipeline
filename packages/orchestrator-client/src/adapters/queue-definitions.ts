import type { ODataCollection, OrchestratorHttp } from "../http.js";
import type { McpClientLike, McpToolMap } from "../mcp-discovery.js";
import { chooseTransport } from "../transport.js";
import {
  fromUiPathQueueDefinition,
  toUiPathQueueDefinition,
  type UiPathQueueDefinition,
} from "./mappers.js";
import type { CreateQueueDefinitionInput, OperationResult, QueueDefinition } from "./types.js";

export interface QueueDefinitionsApi {
  list(folderId?: string): Promise<OperationResult<readonly QueueDefinition[]>>;
  get(id: number, folderId?: string): Promise<OperationResult<QueueDefinition>>;
  create(
    input: CreateQueueDefinitionInput,
    folderId?: string,
  ): Promise<OperationResult<QueueDefinition>>;
  update(
    id: number,
    input: CreateQueueDefinitionInput,
    folderId?: string,
  ): Promise<OperationResult<QueueDefinition>>;
  delete(id: number, folderId?: string): Promise<OperationResult<void>>;
}

export class QueueDefinitionsAdapter implements QueueDefinitionsApi {
  constructor(
    private readonly http: OrchestratorHttp,
    private readonly toolMap: McpToolMap,
    private readonly mcpClient: McpClientLike | undefined,
  ) {}

  async list(folderId?: string): Promise<OperationResult<readonly QueueDefinition[]>> {
    const choice = chooseTransport(this.toolMap, "queueDefinitions", "list");
    if (choice.transport === "mcp" && choice.toolName !== undefined) {
      const result = await this.callMcp(choice.toolName, {});
      const items = (Array.isArray(result) ? result : []).map((entity) =>
        fromUiPathQueueDefinition(entity as UiPathQueueDefinition),
      );
      return { data: items, transport: "mcp" };
    }
    const response = await this.http.get<ODataCollection<UiPathQueueDefinition>>(
      "/odata/QueueDefinitions",
      { ...(folderId !== undefined ? { folderId } : {}) },
    );
    return {
      data: response.value.map(fromUiPathQueueDefinition),
      transport: "rest_fallback",
    };
  }

  async get(id: number, folderId?: string): Promise<OperationResult<QueueDefinition>> {
    const choice = chooseTransport(this.toolMap, "queueDefinitions", "get");
    if (choice.transport === "mcp" && choice.toolName !== undefined) {
      const result = await this.callMcp(choice.toolName, { id });
      return {
        data: fromUiPathQueueDefinition(result as UiPathQueueDefinition),
        transport: "mcp",
      };
    }
    const entity = await this.http.get<UiPathQueueDefinition>(`/odata/QueueDefinitions(${id})`, {
      ...(folderId !== undefined ? { folderId } : {}),
    });
    return { data: fromUiPathQueueDefinition(entity), transport: "rest_fallback" };
  }

  async create(
    input: CreateQueueDefinitionInput,
    folderId?: string,
  ): Promise<OperationResult<QueueDefinition>> {
    const choice = chooseTransport(this.toolMap, "queueDefinitions", "create");
    if (choice.transport === "mcp" && choice.toolName !== undefined) {
      const result = await this.callMcp(choice.toolName, {
        queueDefinition: toUiPathQueueDefinition(input),
      });
      return {
        data: fromUiPathQueueDefinition(result as UiPathQueueDefinition),
        transport: "mcp",
      };
    }
    const created = await this.http.post<UiPathQueueDefinition>(
      "/odata/QueueDefinitions",
      toUiPathQueueDefinition(input),
      { ...(folderId !== undefined ? { folderId } : {}) },
    );
    return { data: fromUiPathQueueDefinition(created), transport: "rest_fallback" };
  }

  async update(
    id: number,
    input: CreateQueueDefinitionInput,
    folderId?: string,
  ): Promise<OperationResult<QueueDefinition>> {
    const choice = chooseTransport(this.toolMap, "queueDefinitions", "update");
    if (choice.transport === "mcp" && choice.toolName !== undefined) {
      const result = await this.callMcp(choice.toolName, {
        id,
        queueDefinition: toUiPathQueueDefinition(input),
      });
      return {
        data: fromUiPathQueueDefinition(result as UiPathQueueDefinition),
        transport: "mcp",
      };
    }
    const updated = await this.http.put<UiPathQueueDefinition>(
      `/odata/QueueDefinitions(${id})`,
      toUiPathQueueDefinition(input),
      { ...(folderId !== undefined ? { folderId } : {}) },
    );
    return {
      data: fromUiPathQueueDefinition(updated ?? toUiPathQueueDefinition(input)),
      transport: "rest_fallback",
    };
  }

  async delete(id: number, folderId?: string): Promise<OperationResult<void>> {
    const choice = chooseTransport(this.toolMap, "queueDefinitions", "delete");
    if (choice.transport === "mcp" && choice.toolName !== undefined) {
      await this.callMcp(choice.toolName, { id });
      return { data: undefined, transport: "mcp" };
    }
    await this.http.delete<void>(`/odata/QueueDefinitions(${id})`, {
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
