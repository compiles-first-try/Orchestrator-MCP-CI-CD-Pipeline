import { describe, expect, it } from "vitest";
import type { ProjectConfig } from "@rpa-platform/config-schema";
import { TenantNotConnectedError } from "@rpa-platform/shared";
import { planReconcile } from "../src/index.js";
import { FakeAssetsApi, FakeBucketsApi, FakeCredentialSource, FakeQueuesApi } from "./fakes.js";

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

function makeInput(overrides: {
  desired?: ProjectConfig;
  assets?: FakeAssetsApi;
  queues?: FakeQueuesApi;
  buckets?: FakeBucketsApi;
  tenantStatus?: "pending_credentials" | "connected" | "auth_failed";
}) {
  return {
    projectId: "proj-1",
    projectName: "demo-bot",
    tenant: "dev" as const,
    tenantStatus: overrides.tenantStatus ?? ("connected" as const),
    desired: overrides.desired ?? emptyDesired(),
    clients: {
      assets: overrides.assets ?? new FakeAssetsApi(),
      queueDefinitions: overrides.queues ?? new FakeQueuesApi(),
      buckets: overrides.buckets ?? new FakeBucketsApi(),
    },
    credentialSource: new FakeCredentialSource(),
    correlationId: "corr-1",
  };
}

describe("planReconcile", () => {
  it("rejects pending_credentials tenants with the spec error code", async () => {
    const input = makeInput({ tenantStatus: "pending_credentials" });
    try {
      await planReconcile(input);
      expect.fail("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(TenantNotConnectedError);
      expect((err as TenantNotConnectedError).code).toBe("reconcile.blocked_unconfigured_tenant");
    }
  });

  it("rejects auth_failed tenants with the same error code", async () => {
    const input = makeInput({ tenantStatus: "auth_failed" });
    await expect(planReconcile(input)).rejects.toBeInstanceOf(TenantNotConnectedError);
  });

  it("creates assets that exist in desired but not current", async () => {
    const input = makeInput({
      desired: {
        ...emptyDesired(),
        assets: [{ name: "OrchestratorUrl", type: "text", value: "https://x", scope: "global" }],
      },
      assets: new FakeAssetsApi([]),
    });
    const plan = await planReconcile(input);
    expect(plan.summary.assets.creates).toBe(1);
    expect(plan.summary.assets.updates).toBe(0);
    expect(plan.operations[0]).toMatchObject({
      action: "create",
      resource: "asset",
      name: "OrchestratorUrl",
    });
  });

  it("updates assets when value differs", async () => {
    const input = makeInput({
      desired: {
        ...emptyDesired(),
        assets: [{ name: "MaxRows", type: "integer", value: 200, scope: "global" }],
      },
      assets: new FakeAssetsApi([
        {
          id: 7,
          name: "MaxRows",
          description: undefined,
          scope: "Global",
          type: "integer",
          value: 100,
        },
      ]),
    });
    const plan = await planReconcile(input);
    expect(plan.summary.assets.creates).toBe(0);
    expect(plan.summary.assets.updates).toBe(1);
    const op = plan.operations[0];
    if (op?.action !== "update" || op.resource !== "asset") {
      expect.fail("expected asset update op");
    } else {
      expect(op.id).toBe(7);
    }
  });

  it("deletes assets present on Orchestrator but absent in desired", async () => {
    const input = makeInput({
      desired: emptyDesired(),
      assets: new FakeAssetsApi([
        {
          id: 9,
          name: "Stale",
          description: undefined,
          scope: "Global",
          type: "text",
          value: "x",
        },
      ]),
    });
    const plan = await planReconcile(input);
    expect(plan.summary.assets.deletes).toBe(1);
  });

  it("orders operations creates → updates → deletes", async () => {
    const input = makeInput({
      desired: {
        ...emptyDesired(),
        assets: [
          { name: "New", type: "text", value: "n", scope: "global" },
          { name: "Existing", type: "text", value: "v2", scope: "global" },
        ],
      },
      assets: new FakeAssetsApi([
        {
          id: 1,
          name: "Existing",
          description: undefined,
          scope: "Global",
          type: "text",
          value: "v1",
        },
        {
          id: 2,
          name: "Stale",
          description: undefined,
          scope: "Global",
          type: "text",
          value: "old",
        },
      ]),
    });
    const plan = await planReconcile(input);
    const actions = plan.operations.map((o) => o.action);
    const createIndex = actions.indexOf("create");
    const updateIndex = actions.indexOf("update");
    const deleteIndex = actions.indexOf("delete");
    expect(createIndex).toBeLessThan(updateIndex);
    expect(updateIndex).toBeLessThan(deleteIndex);
  });

  it("applies asset value overrides at plan time", async () => {
    const input = makeInput({
      desired: {
        ...emptyDesired(),
        assets: [
          { name: "OrchestratorUrl", type: "text", value: "https://default", scope: "global" },
        ],
        overrides: {
          assets: { OrchestratorUrl: { value: "https://dev-override" } },
        },
      },
    });
    const plan = await planReconcile(input);
    const op = plan.operations[0];
    if (op?.action !== "create" || op.resource !== "asset") {
      expect.fail("expected create op");
    } else if (op.input.value.type !== "text") {
      expect.fail("expected text asset");
    } else {
      expect(op.input.value.value).toBe("https://dev-override");
    }
  });

  it("diffs queues by acceptAutoRetry / maxRetries / sla", async () => {
    const input = makeInput({
      desired: {
        ...emptyDesired(),
        queues: [
          {
            name: "Invoices",
            acceptAutoRetry: true,
            maxRetries: 5,
            enforceUniqueReferences: true,
          },
        ],
      },
      queues: new FakeQueuesApi([
        {
          id: 1,
          name: "Invoices",
          description: undefined,
          acceptAutoRetry: false,
          maxRetries: 1,
          enforceUniqueReferences: true,
          slaMinutes: undefined,
        },
      ]),
    });
    const plan = await planReconcile(input);
    expect(plan.summary.queues.updates).toBe(1);
  });

  it("diffs buckets by storageProvider", async () => {
    const input = makeInput({
      desired: {
        ...emptyDesired(),
        buckets: [{ name: "Files", storageProvider: "s3", storageContainerPath: "x" }],
      },
      buckets: new FakeBucketsApi([
        {
          id: 1,
          name: "Files",
          description: undefined,
          storageProvider: "Orchestrator",
          storageContainer: undefined,
        },
      ]),
    });
    const plan = await planReconcile(input);
    expect(plan.summary.buckets.updates).toBe(1);
  });
});
