import { describe, expect, it } from "vitest";
import type { ProjectConfig } from "@rpa-platform/config-schema";
import { applyPlan, planReconcile } from "../src/index.js";
import {
  FailingAssetsApi,
  FakeAssetsApi,
  FakeBucketsApi,
  FakeCredentialSource,
  FakeQueuesApi,
} from "./fakes.js";

function emptyDesired(): ProjectConfig {
  return {
    settings: {},
    constants: {},
    assets: [],
    queues: [],
    buckets: [],
    credentials: [],
    overrides: {},
  };
}

describe("applyPlan", () => {
  it("applies all creates/updates/deletes when there are no errors", async () => {
    const assets = new FakeAssetsApi([
      {
        id: 99,
        name: "Stale",
        description: undefined,
        scope: "Global",
        type: "text",
        value: "old",
      },
    ]);
    const desired: ProjectConfig = {
      ...emptyDesired(),
      assets: [{ name: "New", type: "text", value: "n", scope: "global" }],
    };
    const credentialSource = new FakeCredentialSource();
    const input = {
      projectId: "proj-1",
      projectName: "demo-bot",
      tenant: "dev" as const,
      tenantStatus: "connected" as const,
      desired,
      clients: {
        assets,
        queueDefinitions: new FakeQueuesApi(),
        buckets: new FakeBucketsApi(),
      },
      credentialSource,
      correlationId: "c",
    };
    const plan = await planReconcile(input);
    const result = await applyPlan(input, plan);
    expect(result.success).toBe(true);
    expect(result.applied.every((a) => a.success)).toBe(true);
    expect(assets.created).toHaveLength(1);
    expect(assets.deleted).toEqual([99]);
  });

  it("stops on first failed operation and reports stoppedAt index", async () => {
    const assets = new FailingAssetsApi();
    const desired: ProjectConfig = {
      ...emptyDesired(),
      assets: [
        { name: "First", type: "text", value: "1", scope: "global" },
        { name: "Second", type: "text", value: "2", scope: "global" },
      ],
    };
    const input = {
      projectId: "proj-1",
      projectName: "demo-bot",
      tenant: "dev" as const,
      tenantStatus: "connected" as const,
      desired,
      clients: {
        assets,
        queueDefinitions: new FakeQueuesApi(),
        buckets: new FakeBucketsApi(),
      },
      credentialSource: new FakeCredentialSource(),
      correlationId: "c",
    };
    const plan = await planReconcile(input);
    const result = await applyPlan(input, plan);
    expect(result.success).toBe(false);
    expect(result.stoppedAt).toBe(0);
    expect(result.applied).toHaveLength(1);
    expect(result.applied[0]?.success).toBe(false);
    expect(result.applied[0]?.error?.code).toBe("orchestrator.api.error");
  });

  it("rejects pending_credentials tenants without making any calls", async () => {
    const assets = new FakeAssetsApi();
    const input = {
      projectId: "proj-1",
      projectName: "demo-bot",
      tenant: "dev" as const,
      tenantStatus: "pending_credentials" as const,
      desired: emptyDesired(),
      clients: {
        assets,
        queueDefinitions: new FakeQueuesApi(),
        buckets: new FakeBucketsApi(),
      },
      credentialSource: new FakeCredentialSource(),
      correlationId: "c",
    };
    await expect(
      applyPlan(input, { operations: [], summary: makeEmptySummary() }),
    ).rejects.toThrow();
  });

  it("resolves credential asset username/password from credential-source at apply time", async () => {
    const credentialSource = new FakeCredentialSource();
    credentialSource.set("ServiceAccount", JSON.stringify({ username: "svc", password: "shh" }));
    const assets = new FakeAssetsApi();
    const desired: ProjectConfig = {
      ...emptyDesired(),
      assets: [{ name: "ApiCreds", type: "credential", value: "ServiceAccount", scope: "global" }],
      credentials: [{ name: "ServiceAccount", kind: "username-password" }],
    };
    const input = {
      projectId: "proj-1",
      projectName: "demo-bot",
      tenant: "dev" as const,
      tenantStatus: "connected" as const,
      desired,
      clients: {
        assets,
        queueDefinitions: new FakeQueuesApi(),
        buckets: new FakeBucketsApi(),
      },
      credentialSource,
      correlationId: "c",
    };
    const plan = await planReconcile(input);
    await applyPlan(input, plan);
    const created = assets.created[0];
    expect(created?.value.type).toBe("credential");
    if (created?.value.type === "credential") {
      expect(created.value.username).toBe("svc");
      expect(created.value.password).toBe("shh");
    }
  });

  it("treats non-JSON credential values as raw secrets in the username slot", async () => {
    const credentialSource = new FakeCredentialSource();
    credentialSource.set("VendorApiKey", "abc-raw-key-xyz");
    const assets = new FakeAssetsApi();
    const desired: ProjectConfig = {
      ...emptyDesired(),
      assets: [{ name: "Vendor", type: "credential", value: "VendorApiKey", scope: "global" }],
      credentials: [{ name: "VendorApiKey", kind: "api-key" }],
    };
    const input = {
      projectId: "proj-1",
      projectName: "demo-bot",
      tenant: "dev" as const,
      tenantStatus: "connected" as const,
      desired,
      clients: {
        assets,
        queueDefinitions: new FakeQueuesApi(),
        buckets: new FakeBucketsApi(),
      },
      credentialSource,
      correlationId: "c",
    };
    const plan = await planReconcile(input);
    await applyPlan(input, plan);
    const created = assets.created[0];
    if (created?.value.type === "credential") {
      expect(created.value.username).toBe("abc-raw-key-xyz");
      expect(created.value.password).toBe("");
    } else {
      expect.fail("expected credential asset");
    }
  });

  it("records transport on every applied operation", async () => {
    const assets = new FakeAssetsApi();
    const desired: ProjectConfig = {
      ...emptyDesired(),
      assets: [{ name: "X", type: "text", value: "y", scope: "global" }],
    };
    const input = {
      projectId: "proj-1",
      projectName: "demo-bot",
      tenant: "dev" as const,
      tenantStatus: "connected" as const,
      desired,
      clients: {
        assets,
        queueDefinitions: new FakeQueuesApi(),
        buckets: new FakeBucketsApi(),
      },
      credentialSource: new FakeCredentialSource(),
      correlationId: "c",
    };
    const plan = await planReconcile(input);
    const result = await applyPlan(input, plan);
    expect(result.applied[0]?.transport).toBe("rest_fallback");
  });
});

function makeEmptySummary() {
  return {
    assets: { creates: 0, updates: 0, deletes: 0, unchanged: 0 },
    queues: { creates: 0, updates: 0, deletes: 0, unchanged: 0 },
    buckets: { creates: 0, updates: 0, deletes: 0, unchanged: 0 },
  };
}
