import { describe, expect, it } from "vitest";
import { OrchestratorClient } from "../src/client.js";
import { stubTokenSource } from "./test-helpers.js";

describe("OrchestratorClient", () => {
  it("composes all entity clients given a tokenSource", () => {
    const client = new OrchestratorClient({
      baseUrl: "https://cloud.uipath.com/o/t/orchestrator_",
      tokenSource: stubTokenSource(),
    });
    expect(client.assets).toBeDefined();
    expect(client.queues).toBeDefined();
    expect(client.buckets).toBeDefined();
    expect(client.bucketFiles).toBeDefined();
    expect(client.users).toBeDefined();
    expect(client.rest).toBeDefined();
  });

  it("constructs a TokenManager when tenantConfig is supplied", () => {
    const client = new OrchestratorClient({
      baseUrl: "https://cloud.uipath.com/o/t/orchestrator_",
      tenantConfig: {
        identityTokenUrl: "https://cloud.uipath.com/o/identity_/connect/token",
        clientId: "x",
        clientSecret: "y",
        scopes: ["OR.Default"],
      },
    });
    expect(client.tokenSource).toBeDefined();
  });

  it("throws when neither tokenSource nor tenantConfig is provided", () => {
    expect(
      () =>
        new OrchestratorClient({
          baseUrl: "https://cloud.uipath.com/o/t/orchestrator_",
        }),
    ).toThrow();
  });
});
