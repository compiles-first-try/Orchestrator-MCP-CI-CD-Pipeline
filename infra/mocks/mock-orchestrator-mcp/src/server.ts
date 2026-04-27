import Fastify, { type FastifyInstance } from "fastify";

interface MockState {
  assets: Map<number, Record<string, unknown>>;
  queues: Map<number, Record<string, unknown>>;
  buckets: Map<number, Record<string, unknown>>;
  nextId: number;
}

export function createMockServer(): FastifyInstance {
  const app = Fastify({ logger: { level: "warn" } });
  const state: MockState = {
    assets: new Map(),
    queues: new Map(),
    buckets: new Map(),
    nextId: 1,
  };

  // MCP discovery: respond with an empty tool list so orchestrator-client
  // exercises the "no MCP tools, fall back to REST" path that matches
  // production reality per docs/research/uipath-mcp-tool-surface-*.md.
  app.post("/mcp/list-tools", async () => ({ tools: [] }));

  // Identity Server token endpoint. Returns a fixed bearer for any
  // client_credentials grant.
  app.post("/identity_/connect/token", async () => ({
    access_token: "mock-token",
    expires_in: 3600,
    token_type: "Bearer",
  }));

  // OData CRUD for the four resource types the reconciler touches.
  for (const [resource, store] of [
    ["Assets", state.assets],
    ["QueueDefinitions", state.queues],
    ["Buckets", state.buckets],
  ] as const) {
    app.get(`/odata/${resource}`, async () => ({
      "@odata.context": "mock",
      value: Array.from(store.values()),
    }));
    app.post(`/odata/${resource}`, async (request) => {
      const id = state.nextId++;
      const entity = { Id: id, ...(request.body as Record<string, unknown>) };
      store.set(id, entity);
      return entity;
    });
    app.put(`/odata/${resource}(:id)`, async (request) => {
      const id = Number((request.params as { id: string }).id);
      const entity = { Id: id, ...(request.body as Record<string, unknown>) };
      store.set(id, entity);
      return entity;
    });
    app.delete(`/odata/${resource}(:id)`, async (request, reply) => {
      const id = Number((request.params as { id: string }).id);
      store.delete(id);
      reply.code(204).send();
    });
  }

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env["MOCK_PORT"] ?? 4000);
  const app = createMockServer();
  app.listen({ port, host: "0.0.0.0" }).then(() => {
    process.stdout.write(`mock-orchestrator-mcp listening on :${port}\n`);
  });
}
