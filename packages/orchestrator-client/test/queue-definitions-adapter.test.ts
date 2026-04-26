import { describe, expect, it } from "vitest";
import { jsonResponse, makeTokenManager, mockOrchestrator, tokenResponse } from "./test-helpers.js";
import { OrchestratorClient } from "../src/index.js";

const baseUrl = "https://orch.example/orchestrator_";

describe("QueueDefinitionsAdapter (REST path)", () => {
  it("creates a queue definition with the right OData entity shape", async () => {
    const { fetch, recorded } = mockOrchestrator((req) => {
      if (req.url.includes("/connect/token")) return tokenResponse();
      return jsonResponse(
        {
          Id: 5,
          Name: "Invoices",
          MaxNumberOfRetries: 3,
          AcceptAutomaticallyRetry: true,
          EnforceUniqueReference: true,
          SlaInMinutes: 30,
        },
        201,
      );
    });
    const client = new OrchestratorClient({
      orchestratorUrl: baseUrl,
      tokenManager: makeTokenManager(fetch),
      fetch,
    });
    const result = await client.queueDefinitions.create({
      name: "Invoices",
      acceptAutoRetry: true,
      maxRetries: 3,
      enforceUniqueReferences: true,
      slaMinutes: 30,
    });
    expect(result.data.id).toBe(5);
    expect(result.data.maxRetries).toBe(3);
    const apiCall = recorded.find((r) => r.url.includes("/odata/QueueDefinitions"));
    const body = JSON.parse(apiCall?.body as string) as Record<string, unknown>;
    expect(body).toEqual({
      Name: "Invoices",
      MaxNumberOfRetries: 3,
      AcceptAutomaticallyRetry: true,
      EnforceUniqueReference: true,
      SlaInMinutes: 30,
    });
  });

  it("lists queue definitions", async () => {
    const { fetch } = mockOrchestrator((req) => {
      if (req.url.includes("/connect/token")) return tokenResponse();
      return jsonResponse({
        value: [
          {
            Id: 1,
            Name: "Q1",
            MaxNumberOfRetries: 1,
            AcceptAutomaticallyRetry: false,
            EnforceUniqueReference: true,
          },
        ],
      });
    });
    const client = new OrchestratorClient({
      orchestratorUrl: baseUrl,
      tokenManager: makeTokenManager(fetch),
      fetch,
    });
    const result = await client.queueDefinitions.list();
    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.name).toBe("Q1");
  });
});
