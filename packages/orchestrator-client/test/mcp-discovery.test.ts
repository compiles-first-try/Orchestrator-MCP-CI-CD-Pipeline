import { describe, expect, it } from "vitest";
import {
  chooseTransport,
  discoverMcpTools,
  McpToolMap,
  OrchestratorTransportError,
  type McpClientFactory,
  type McpClientLike,
  type McpToolDescriptor,
} from "../src/index.js";

function fakeClient(tools: readonly McpToolDescriptor[]): McpClientLike & { closed: boolean } {
  const state = { closed: false };
  return {
    listTools: () => Promise.resolve({ tools }),
    close: async () => {
      state.closed = true;
    },
    get closed() {
      return state.closed;
    },
  };
}

function fakeFactory(tools: readonly McpToolDescriptor[]): McpClientFactory {
  return async () => fakeClient(tools);
}

describe("McpToolMap", () => {
  it("is empty for an empty tool list", () => {
    const map = new McpToolMap([]);
    expect(map.size()).toBe(0);
    expect(map.toolFor("assets", "create")).toBeUndefined();
  });

  it("indexes tools that match the uipath.<resource>.<op> pattern", () => {
    const map = new McpToolMap([
      { name: "uipath.assets.create" },
      { name: "uipath.queueDefinitions.list" },
      { name: "uipath.buckets.delete" },
    ]);
    expect(map.size()).toBe(3);
    expect(map.toolFor("assets", "create")).toBe("uipath.assets.create");
    expect(map.toolFor("queueDefinitions", "list")).toBe("uipath.queueDefinitions.list");
    expect(map.toolFor("buckets", "delete")).toBe("uipath.buckets.delete");
  });

  it("ignores tools that don't match the naming pattern", () => {
    const map = new McpToolMap([
      { name: "some_other_tool" },
      { name: "uipath.unknown_resource.list" },
      { name: "uipath.assets.unknown_op" },
    ]);
    expect(map.size()).toBe(0);
  });

  it("preserves the original tool list for inspection", () => {
    const tools: McpToolDescriptor[] = [{ name: "uipath.assets.list", description: "list assets" }];
    const map = new McpToolMap(tools);
    expect(map.list()).toEqual(tools);
  });
});

describe("discoverMcpTools", () => {
  it("returns a populated map when the factory returns matching tools", async () => {
    const result = await discoverMcpTools("https://mcp.example", {
      factory: fakeFactory([{ name: "uipath.assets.create" }]),
    });
    expect(result.toolMap.toolFor("assets", "create")).toBe("uipath.assets.create");
    await result.close();
  });

  it("returns an empty map when the factory returns no tools", async () => {
    const result = await discoverMcpTools("https://mcp.example", {
      factory: fakeFactory([]),
    });
    expect(result.toolMap.size()).toBe(0);
  });

  it("throws OrchestratorTransportError when the factory rejects (default behavior)", async () => {
    const factory: McpClientFactory = () => Promise.reject(new Error("ECONNREFUSED"));
    await expect(discoverMcpTools("https://mcp.example", { factory })).rejects.toBeInstanceOf(
      OrchestratorTransportError,
    );
  });

  it("returns an empty map when the factory rejects and onFailure='empty'", async () => {
    const factory: McpClientFactory = () => Promise.reject(new Error("ECONNREFUSED"));
    const result = await discoverMcpTools("https://mcp.example", {
      factory,
      onFailure: "empty",
    });
    expect(result.toolMap.size()).toBe(0);
  });

  it("throws OrchestratorTransportError when listTools rejects", async () => {
    const factory: McpClientFactory = async () => ({
      listTools: () => Promise.reject(new Error("server crashed")),
      close: async () => undefined,
    });
    await expect(discoverMcpTools("https://mcp.example", { factory })).rejects.toBeInstanceOf(
      OrchestratorTransportError,
    );
  });

  it("closes the client even if listTools rejects", async () => {
    let closed = false;
    const factory: McpClientFactory = async () => ({
      listTools: () => Promise.reject(new Error("boom")),
      close: async () => {
        closed = true;
      },
    });
    await expect(
      discoverMcpTools("https://mcp.example", { factory, onFailure: "empty" }),
    ).resolves.toBeDefined();
    expect(closed).toBe(true);
  });

  it("default factory throws OrchestratorTransportError (no real factory wired in v1)", async () => {
    await expect(discoverMcpTools("https://mcp.example")).rejects.toBeInstanceOf(
      OrchestratorTransportError,
    );
  });

  it("close() is best-effort and swallows close errors", async () => {
    const factory: McpClientFactory = async () => ({
      listTools: () => Promise.resolve({ tools: [] }),
      close: () => Promise.reject(new Error("already closed")),
    });
    const result = await discoverMcpTools("https://mcp.example", { factory });
    await expect(result.close()).resolves.toBeUndefined();
  });
});

describe("chooseTransport", () => {
  it("returns rest_fallback when the tool is not in the map", () => {
    const map = new McpToolMap([]);
    const choice = chooseTransport(map, "assets", "create");
    expect(choice.transport).toBe("rest_fallback");
    expect(choice.toolName).toBeUndefined();
  });

  it("returns mcp when the tool is in the map", () => {
    const map = new McpToolMap([{ name: "uipath.assets.create" }]);
    const choice = chooseTransport(map, "assets", "create");
    expect(choice.transport).toBe("mcp");
    expect(choice.toolName).toBe("uipath.assets.create");
  });

  it("returns rest_fallback for ops that aren't in the map even if the resource is", () => {
    const map = new McpToolMap([{ name: "uipath.assets.list" }]);
    expect(chooseTransport(map, "assets", "delete").transport).toBe("rest_fallback");
  });
});
