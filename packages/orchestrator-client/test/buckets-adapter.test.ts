import { describe, expect, it } from "vitest";
import { jsonResponse, makeTokenManager, mockOrchestrator, tokenResponse } from "./test-helpers.js";
import { OrchestratorClient } from "../src/index.js";

const baseUrl = "https://orch.example/orchestrator_";

describe("BucketsAdapter (REST path)", () => {
  it("creates a bucket with default Orchestrator provider", async () => {
    const { fetch, recorded } = mockOrchestrator((req) => {
      if (req.url.includes("/connect/token")) return tokenResponse();
      return jsonResponse(
        {
          Id: 1,
          Name: "Inputs",
          StorageProvider: "Orchestrator",
        },
        201,
      );
    });
    const client = new OrchestratorClient({
      orchestratorUrl: baseUrl,
      tokenManager: makeTokenManager(fetch),
      fetch,
    });
    const result = await client.buckets.create({
      name: "Inputs",
      storageProvider: "Orchestrator",
    });
    expect(result.data.id).toBe(1);
    const apiCall = recorded.find((r) => r.url.includes("/odata/Buckets"));
    const body = JSON.parse(apiCall?.body as string) as Record<string, unknown>;
    expect(body.Name).toBe("Inputs");
    expect(body.StorageProvider).toBe("Orchestrator");
  });

  it("creates an S3 bucket and emits the storage container", async () => {
    const { fetch, recorded } = mockOrchestrator((req) => {
      if (req.url.includes("/connect/token")) return tokenResponse();
      return jsonResponse({
        Id: 9,
        Name: "S3",
        StorageProvider: "Amazon",
        StorageContainer: "bucket-x",
      });
    });
    const client = new OrchestratorClient({
      orchestratorUrl: baseUrl,
      tokenManager: makeTokenManager(fetch),
      fetch,
    });
    await client.buckets.create({
      name: "S3",
      storageProvider: "Amazon",
      storageContainer: "bucket-x",
    });
    const apiCall = recorded.find((r) => r.url.includes("/odata/Buckets"));
    const body = JSON.parse(apiCall?.body as string) as Record<string, unknown>;
    expect(body.StorageContainer).toBe("bucket-x");
  });
});
