import type { McpToolMap, OpKey, ResourceKey } from "./mcp-discovery.js";

export type Transport = "mcp" | "rest_fallback";

export interface TransportChoice {
  readonly transport: Transport;
  readonly toolName: string | undefined;
}

export function chooseTransport(
  toolMap: McpToolMap,
  resource: ResourceKey,
  op: OpKey,
): TransportChoice {
  const toolName = toolMap.toolFor(resource, op);
  return toolName === undefined
    ? { transport: "rest_fallback", toolName: undefined }
    : { transport: "mcp", toolName };
}
