import { OrchestratorTransportError } from "./errors.js";

export interface McpToolDescriptor {
  readonly name: string;
  readonly description?: string;
}

export interface McpClientLike {
  listTools(): Promise<{ tools: readonly McpToolDescriptor[] }>;
  close(): Promise<void>;
}

export type McpClientFactory = (mcpUrl: string) => Promise<McpClientLike>;

export const RESOURCES = [
  "assets",
  "queueDefinitions",
  "buckets",
  "bucketFiles",
  "credentials",
] as const;
export type ResourceKey = (typeof RESOURCES)[number];

export const OPS = ["list", "get", "create", "update", "delete", "upload", "download"] as const;
export type OpKey = (typeof OPS)[number];

export class McpToolMap {
  private readonly map: ReadonlyMap<string, string>;
  private readonly tools: readonly McpToolDescriptor[];

  constructor(tools: readonly McpToolDescriptor[]) {
    this.tools = tools;
    const m = new Map<string, string>();
    for (const tool of tools) {
      const parsed = parseToolName(tool.name);
      if (parsed === undefined) continue;
      m.set(`${parsed.resource}.${parsed.op}`, tool.name);
    }
    this.map = m;
  }

  toolFor(resource: ResourceKey, op: OpKey): string | undefined {
    return this.map.get(`${resource}.${op}`);
  }

  size(): number {
    return this.map.size;
  }

  list(): readonly McpToolDescriptor[] {
    return this.tools;
  }
}

export interface DiscoveryResult {
  readonly toolMap: McpToolMap;
  readonly close: () => Promise<void>;
}

export interface DiscoveryOptions {
  readonly factory?: McpClientFactory;
  readonly onFailure?: "throw" | "empty";
}

export async function discoverMcpTools(
  mcpUrl: string,
  options: DiscoveryOptions = {},
): Promise<DiscoveryResult> {
  const factory = options.factory ?? defaultMcpClientFactory;
  const onFailure = options.onFailure ?? "throw";
  let client: McpClientLike;
  try {
    client = await factory(mcpUrl);
  } catch (cause) {
    if (onFailure === "empty") {
      return emptyResult();
    }
    throw new OrchestratorTransportError("could not connect to MCP server", { cause });
  }
  let listed: { tools: readonly McpToolDescriptor[] };
  try {
    listed = await client.listTools();
  } catch (cause) {
    await safeClose(client);
    if (onFailure === "empty") {
      return emptyResult();
    }
    throw new OrchestratorTransportError("could not list MCP tools", { cause });
  }
  return {
    toolMap: new McpToolMap(listed.tools),
    close: () => safeClose(client),
  };
}

function emptyResult(): DiscoveryResult {
  return {
    toolMap: new McpToolMap([]),
    close: async () => undefined,
  };
}

async function safeClose(client: McpClientLike): Promise<void> {
  try {
    await client.close();
  } catch {
    // Closing is best-effort; transport may already be closed.
  }
}

const TOOL_NAME_PATTERN = /^uipath\.([a-zA-Z]+)\.([a-zA-Z]+)$/;
const RESOURCE_SET = new Set<string>(RESOURCES);
const OP_SET = new Set<string>(OPS);

function parseToolName(name: string): { resource: ResourceKey; op: OpKey } | undefined {
  const match = TOOL_NAME_PATTERN.exec(name);
  if (match === null) return undefined;
  const resource = match[1];
  const op = match[2];
  if (resource === undefined || op === undefined) return undefined;
  if (RESOURCE_SET.has(resource) === false) return undefined;
  if (OP_SET.has(op) === false) return undefined;
  return { resource: resource as ResourceKey, op: op as OpKey };
}

const defaultMcpClientFactory: McpClientFactory = async () => {
  // The default factory is intentionally inert in v1: per docs/research/
  // uipath-mcp-tool-surface-2026-04-26.md, UiPath Cloud's MCP servers do not
  // expose Orchestrator resource-management tools today. Callers that wire up
  // option (C) — a Coded UiPath MCP server — pass their own factory that
  // builds a real Client + transport from @modelcontextprotocol/sdk.
  throw new OrchestratorTransportError(
    "no default MCP client factory is configured; pass options.factory or omit mcpUrl",
  );
};
