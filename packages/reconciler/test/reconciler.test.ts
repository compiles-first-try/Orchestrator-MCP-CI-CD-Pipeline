import { describe, expect, it, vi } from "vitest";
import {
  AssetsFile,
  BucketsFile,
  ConstantsFile,
  CredentialsFile,
  OverridesFile,
  QueuesFile,
  SettingsFile,
} from "@rpa-platform/config-schema";
import type { ConfigOutputWriter } from "@rpa-platform/config-output";
import type { CredentialSourceRegistry } from "@rpa-platform/credential-source";
import type { OrchestratorClient } from "@rpa-platform/orchestrator-client";
import { TenantNotConnectedError } from "@rpa-platform/shared";
import { Reconciler } from "../src/reconciler.js";
import type { AuditEvent, AuditSink } from "../src/types.js";

function buildInput(tenantStatus: "connected" | "pending_credentials" = "connected") {
  return {
    tenant: "dev" as const,
    tenantStatus,
    project: { name: "demo-bot" },
    pinnedFrameworkVersion: "2.0.0",
    bucketIdForConfig: 99,
    folderId: 1,
    configs: {
      tenant: "dev" as const,
      settings: SettingsFile.parse({ schemaVersion: 1, settings: {} }),
      constants: ConstantsFile.parse({ schemaVersion: 1, constants: {} }),
      assets: AssetsFile.parse({
        schemaVersion: 1,
        assets: [{ name: "ApiUrl", type: "text", value: "https://example.com" }],
      }),
      queues: QueuesFile.parse({ schemaVersion: 1, queues: [{ name: "Orders" }] }),
      buckets: BucketsFile.parse({ schemaVersion: 1, buckets: [{ name: "config" }] }),
      credentials: CredentialsFile.parse({ schemaVersion: 1, credentials: [] }),
      overrides: OverridesFile.parse({ schemaVersion: 1, overrides: {} }),
    },
  };
}

function fakeOrchestrator(): {
  client: OrchestratorClient;
  calls: { method: string; args: unknown[] }[];
} {
  const calls: { method: string; args: unknown[] }[] = [];
  const record = (method: string) =>
    vi.fn(async (...args: unknown[]) => {
      calls.push({ method, args });
      if (method.endsWith(".list")) return [];
      return { Id: Math.floor(Math.random() * 1000) };
    });
  const client = {
    assets: { list: record("assets.list"), create: record("assets.create"), update: record("assets.update"), delete: record("assets.delete") },
    queues: { list: record("queues.list"), create: record("queues.create"), update: record("queues.update"), delete: record("queues.delete") },
    buckets: { list: record("buckets.list"), create: record("buckets.create"), update: record("buckets.update"), delete: record("buckets.delete") },
    bucketFiles: { upload: record("bucketFiles.upload") },
  } as unknown as OrchestratorClient;
  return { client, calls };
}

function fakeAudit(): { sink: AuditSink; events: AuditEvent[] } {
  const events: AuditEvent[] = [];
  return {
    events,
    sink: {
      async emit(event) {
        events.push(event);
      },
    },
  };
}

function fakeConfigOutput(): ConfigOutputWriter {
  return {
    resolve: vi.fn((input) => ({
      tenant: input.tenant,
      settings: input.settings.settings,
      constants: input.constants.constants,
      assets: input.assets.assets,
      queues: input.queues.queues,
      buckets: input.buckets.buckets,
      credentials: input.credentials.credentials,
    })),
    writeToBucket: vi.fn(async () => ({ jsonBytes: 100, xlsxBytes: undefined, wroteLegacyExcel: false })),
  } as unknown as ConfigOutputWriter;
}

const NO_CREDS = { get: () => undefined, has: () => false } as unknown as CredentialSourceRegistry;

describe("Reconciler", () => {
  it("rejects reconcile against an unconnected tenant", async () => {
    const { client } = fakeOrchestrator();
    const reconciler = new Reconciler(client, NO_CREDS, fakeConfigOutput(), fakeAudit().sink);
    const input = buildInput("pending_credentials");
    await expect(reconciler.dryRun(input)).rejects.toBeInstanceOf(TenantNotConnectedError);
  });

  it("dry-run produces a diff without calling create/update/delete", async () => {
    const { client, calls } = fakeOrchestrator();
    const reconciler = new Reconciler(client, NO_CREDS, fakeConfigOutput(), fakeAudit().sink);
    const result = await reconciler.dryRun(buildInput());
    expect(result.diff.assets.creates).toHaveLength(1);
    expect(result.diff.queues.creates).toHaveLength(1);
    expect(result.diff.buckets.creates).toHaveLength(1);
    const mutators = calls.filter((c) =>
      ["assets.create", "queues.create", "buckets.create", "assets.update"].includes(c.method),
    );
    expect(mutators).toHaveLength(0);
  });

  it("apply executes create→update and uploads Config.json on success", async () => {
    const { client, calls } = fakeOrchestrator();
    const audit = fakeAudit();
    const configOutput = fakeConfigOutput();
    const reconciler = new Reconciler(client, NO_CREDS, configOutput, audit.sink);
    const result = await reconciler.apply(buildInput(), "corr-1");

    expect(result.stoppedAt).toBeUndefined();
    const methods = calls.map((c) => c.method);
    expect(methods).toContain("assets.create");
    expect(methods).toContain("queues.create");
    expect(methods).toContain("buckets.create");
    // The actual bucket upload is delegated to ConfigOutputWriter; assert it
    // was invoked (the fake stands in for the real writer, which is tested
    // separately in @rpa-platform/config-output).
    expect((configOutput.writeToBucket as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);

    const auditedActions = audit.events.map((e) => `${e.action}/${e.resourceKind}`);
    expect(auditedActions).toContain("create/asset");
    expect(auditedActions).toContain("upload/config_file");
    expect(audit.events.every((e) => e.correlationId === "corr-1")).toBe(true);
  });

  it("default (allowDeletes omitted) skips deletes with the documented reason", async () => {
    // Pre-seed orchestrator with current entities that don't appear in the
    // desired config — they should be reported as drift but NOT deleted
    // when allowDeletes is unset.
    const { client, calls } = fakeOrchestrator();
    (client.assets.list as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { Id: 999, Name: "Orphan", ValueType: "Text", StringValue: "leftover" },
    ]);
    (client.queues.list as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { Id: 998, Name: "OrphanQueue" },
    ]);
    (client.buckets.list as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { Id: 997, Name: "OrphanBucket", StorageProvider: "Orchestrator" },
    ]);
    const audit = fakeAudit();
    const result = await new Reconciler(client, NO_CREDS, fakeConfigOutput(), audit.sink).apply(
      buildInput(),
      "corr-no-delete",
    );

    expect(result.stoppedAt).toBeUndefined();
    const methods = calls.map((c) => c.method);
    expect(methods).not.toContain("assets.delete");
    expect(methods).not.toContain("queues.delete");
    expect(methods).not.toContain("buckets.delete");

    const skipped = result.outcomes.filter((o) => o.status === "skipped");
    expect(skipped.map((s) => s.resourceName).sort()).toEqual(["Orphan", "OrphanBucket", "OrphanQueue"]);
    expect(skipped.every((s) => s.action === "delete")).toBe(true);

    const skipEvents = audit.events.filter((e) => e.status === "skipped");
    expect(skipEvents.length).toBe(3);
    expect(
      skipEvents.every(
        (e) =>
          (e.details as { reason?: string })?.reason === "caller_lacks_delete_permission_or_prod_locked",
      ),
    ).toBe(true);
  });

  it("allowDeletes=true plans + applies deletes after creates and updates", async () => {
    const { client, calls } = fakeOrchestrator();
    (client.assets.list as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { Id: 999, Name: "Orphan", ValueType: "Text", StringValue: "leftover" },
    ]);
    (client.queues.list as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { Id: 998, Name: "OrphanQueue" },
    ]);
    const audit = fakeAudit();
    const input = { ...buildInput(), allowDeletes: true };
    const result = await new Reconciler(client, NO_CREDS, fakeConfigOutput(), audit.sink).apply(
      input,
      "corr-with-delete",
    );

    expect(result.stoppedAt).toBeUndefined();
    const methods = calls.map((c) => c.method);
    expect(methods).toContain("assets.delete");
    expect(methods).toContain("queues.delete");

    // Order check: every create/update appears in the methods array BEFORE
    // every delete (the planned order is creates → updates → deletes).
    const lastCreateOrUpdate = methods.findLastIndex(
      (m) => m.endsWith(".create") || m.endsWith(".update"),
    );
    const firstDelete = methods.findIndex((m) => m.endsWith(".delete"));
    expect(firstDelete).toBeGreaterThan(lastCreateOrUpdate);

    // No skipped-delete audit entries when deletes are allowed.
    const skippedDeletes = result.outcomes.filter((o) => o.action === "delete" && o.status === "skipped");
    expect(skippedDeletes).toHaveLength(0);
  });

  it("stops on first failure and reports the failed step", async () => {
    const { client, calls } = fakeOrchestrator();
    // Make the first asset.create throw.
    (client.assets.create as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
      throw new Error("orchestrator boom");
    });
    const audit = fakeAudit();
    const reconciler = new Reconciler(client, NO_CREDS, fakeConfigOutput(), audit.sink);
    const result = await reconciler.apply(buildInput(), "corr-2");

    expect(result.stoppedAt?.action).toBe("create");
    expect(result.stoppedAt?.status).toBe("failed");
    // queues.create should NOT have been called because asset failed first.
    expect(calls.find((c) => c.method === "queues.create")).toBeUndefined();
    // bucket-file upload should also be skipped on failure.
    expect(calls.find((c) => c.method === "bucketFiles.upload")).toBeUndefined();
    // Audit must record the failure.
    expect(audit.events.some((e) => e.status === "failed")).toBe(true);
  });
});
