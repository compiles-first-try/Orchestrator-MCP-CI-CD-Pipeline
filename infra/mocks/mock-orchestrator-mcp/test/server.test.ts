import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createMockServer } from "../src/server.js";

let app: FastifyInstance;

beforeAll(async () => {
  app = createMockServer();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe("mock-orchestrator-mcp", () => {
  it("returns an empty MCP tool list (matches production reality)", async () => {
    const response = await app.inject({ method: "POST", url: "/mcp/list-tools" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ tools: [] });
  });

  it("returns a fixed bearer for any client_credentials grant", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/identity_/connect/token",
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { access_token: string; expires_in: number };
    expect(body.access_token).toBe("mock-token");
    expect(body.expires_in).toBeGreaterThan(0);
  });

  it("supports the OData CRUD round-trip for Assets", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/odata/Assets",
      payload: { Name: "X", ValueType: "Text", StringValue: "y" },
    });
    expect(created.statusCode).toBe(200);
    const list = await app.inject({ method: "GET", url: "/odata/Assets" });
    const body = list.json() as { value: unknown[] };
    expect(body.value.length).toBeGreaterThan(0);
  });

  it("supports DELETE on Assets returning 204", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/odata/Assets",
      payload: { Name: "Z" },
    });
    const id = (created.json() as { Id: number }).Id;
    const del = await app.inject({ method: "DELETE", url: `/odata/Assets(${id})` });
    expect(del.statusCode).toBe(204);
  });
});
