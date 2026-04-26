import { describe, expect, it } from "vitest";
import { jsonResponse, makeTokenManager, mockOrchestrator, tokenResponse } from "./test-helpers.js";
import {
  OrchestratorClient,
  type CreateAssetInput,
  type McpClientFactory,
  type McpClientLike,
} from "../src/index.js";

const baseUrl = "https://orch.example/orchestrator_";

describe("AssetsAdapter (REST path)", () => {
  it("lists assets and returns transport=rest_fallback", async () => {
    const { fetch } = mockOrchestrator((req) => {
      if (req.url.includes("/connect/token")) return tokenResponse();
      return jsonResponse({
        value: [
          { Id: 1, Name: "Url", ValueScope: "Global", ValueType: "Text", StringValue: "x" },
          { Id: 2, Name: "Max", ValueScope: "Global", ValueType: "Integer", IntValue: 5 },
        ],
      });
    });
    const client = new OrchestratorClient({
      orchestratorUrl: baseUrl,
      tokenManager: makeTokenManager(fetch),
      fetch,
    });
    const result = await client.assets.list();
    expect(result.transport).toBe("rest_fallback");
    expect(result.data).toHaveLength(2);
    expect(result.data[0]).toMatchObject({ name: "Url", type: "text", value: "x" });
    expect(result.data[1]).toMatchObject({ name: "Max", type: "integer", value: 5 });
  });

  it("creates a text asset and posts the right OData entity", async () => {
    const { fetch, recorded } = mockOrchestrator((req) => {
      if (req.url.includes("/connect/token")) return tokenResponse();
      return jsonResponse(
        { Id: 99, Name: "Url", ValueScope: "Global", ValueType: "Text", StringValue: "https://x" },
        201,
      );
    });
    const client = new OrchestratorClient({
      orchestratorUrl: baseUrl,
      tokenManager: makeTokenManager(fetch),
      fetch,
    });
    const input: CreateAssetInput = {
      name: "Url",
      scope: "Global",
      value: { type: "text", value: "https://x" },
    };
    const result = await client.assets.create(input);
    expect(result.transport).toBe("rest_fallback");
    expect(result.data.id).toBe(99);
    const apiCall = recorded.find((r) => r.url.includes("/odata/Assets"));
    expect(apiCall?.method).toBe("POST");
    const body = JSON.parse(apiCall?.body as string) as Record<string, unknown>;
    expect(body).toEqual({
      Name: "Url",
      ValueScope: "Global",
      ValueType: "Text",
      StringValue: "https://x",
    });
  });

  it("creates a credential asset with username + password", async () => {
    const { fetch, recorded } = mockOrchestrator((req) => {
      if (req.url.includes("/connect/token")) return tokenResponse();
      return jsonResponse({
        Id: 7,
        Name: "ApiCreds",
        ValueScope: "Global",
        ValueType: "Credential",
        CredentialUsername: "svc",
      });
    });
    const client = new OrchestratorClient({
      orchestratorUrl: baseUrl,
      tokenManager: makeTokenManager(fetch),
      fetch,
    });
    const result = await client.assets.create({
      name: "ApiCreds",
      scope: "Global",
      value: { type: "credential", username: "svc", password: "shh" },
    });
    expect(result.data.type).toBe("credential");
    if (result.data.type === "credential") {
      expect(result.data.username).toBe("svc");
    }
    const apiCall = recorded.find((r) => r.url.includes("/odata/Assets"));
    const body = JSON.parse(apiCall?.body as string) as Record<string, unknown>;
    expect(body.ValueType).toBe("Credential");
    expect(body.CredentialUsername).toBe("svc");
    expect(body.CredentialPassword).toBe("shh");
  });

  it("deletes by id and emits DELETE", async () => {
    const { fetch, recorded } = mockOrchestrator((req) => {
      if (req.url.includes("/connect/token")) return tokenResponse();
      return new Response(null, { status: 204 });
    });
    const client = new OrchestratorClient({
      orchestratorUrl: baseUrl,
      tokenManager: makeTokenManager(fetch),
      fetch,
    });
    const result = await client.assets.delete(42);
    expect(result.transport).toBe("rest_fallback");
    const apiCall = recorded.find((r) => r.url.includes("/odata/Assets(42)"));
    expect(apiCall?.method).toBe("DELETE");
  });
});

describe("AssetsAdapter (MCP path)", () => {
  it("routes to MCP when a matching tool is discovered", async () => {
    const calls: { name: string; args: Record<string, unknown> }[] = [];
    const mcpClient: McpClientLike = {
      listTools: () =>
        Promise.resolve({
          tools: [{ name: "uipath.assets.create" }],
        }),
      callTool: (name, args) => {
        calls.push({ name, args: args as Record<string, unknown> });
        return Promise.resolve({
          Id: 11,
          Name: "Url",
          ValueScope: "Global",
          ValueType: "Text",
          StringValue: "x",
        });
      },
      close: async () => undefined,
    };
    const factory: McpClientFactory = async () => mcpClient;
    const { fetch } = mockOrchestrator((req) => {
      if (req.url.includes("/connect/token")) return tokenResponse();
      throw new Error("REST should not be called when MCP routes the op");
    });
    const client = new OrchestratorClient({
      orchestratorUrl: baseUrl,
      tokenManager: makeTokenManager(fetch),
      fetch,
      mcpUrl: "https://mcp.example",
      mcpFactory: factory,
    });
    await client.init();
    const result = await client.assets.create({
      name: "Url",
      scope: "Global",
      value: { type: "text", value: "x" },
    });
    expect(result.transport).toBe("mcp");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.name).toBe("uipath.assets.create");
    await client.shutdown();
  });

  it("does NOT silently fall back to REST when an MCP call fails", async () => {
    const mcpClient: McpClientLike = {
      listTools: () =>
        Promise.resolve({
          tools: [{ name: "uipath.assets.list" }],
        }),
      callTool: () => Promise.reject(new Error("MCP boom")),
      close: async () => undefined,
    };
    const factory: McpClientFactory = async () => mcpClient;
    const { fetch, recorded } = mockOrchestrator((req) => {
      if (req.url.includes("/connect/token")) return tokenResponse();
      return jsonResponse({ value: [] });
    });
    const client = new OrchestratorClient({
      orchestratorUrl: baseUrl,
      tokenManager: makeTokenManager(fetch),
      fetch,
      mcpUrl: "https://mcp.example",
      mcpFactory: factory,
    });
    await client.init();
    await expect(client.assets.list()).rejects.toThrow(/MCP boom/);
    const restCall = recorded.find((r) => r.url.includes("/odata/Assets"));
    expect(restCall).toBeUndefined();
    await client.shutdown();
  });
});
