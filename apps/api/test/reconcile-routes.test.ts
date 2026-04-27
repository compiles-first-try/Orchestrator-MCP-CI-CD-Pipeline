import { describe, expect, it } from "vitest";
import {
  PERMISSIONS,
  type Role,
  type UserWithRoles,
  type RolePermissions,
} from "@rpa-platform/shared";
import {
  createApp,
  InMemoryAuditWriter,
  TestAuthenticator,
  type ApplyOutcome,
  type DryRunOutcome,
} from "../src/index.js";

function makeUser(id: string, permissions: RolePermissions): UserWithRoles {
  const role: Role = {
    id: `role-${id}`,
    name: `role-${id}`,
    isSystem: false,
    permissions,
  };
  return { id, roles: [role] };
}

const developer = makeUser("dev-user", {
  [PERMISSIONS.PROJECT_READ]: { tenants: "all" },
  [PERMISSIONS.PR_APPROVE_DEV_TO_TEST]: { tenants: ["dev", "test"] },
});

const ba = makeUser("ba-user", {
  [PERMISSIONS.PROJECT_READ]: { tenants: "all" },
  [PERMISSIONS.PR_APPROVE_STAGE_TO_PROD]: { tenants: ["prod"] },
});

const stranger = makeUser("stranger", {});

const users = new Map<string, UserWithRoles>([
  [developer.id, developer],
  [ba.id, ba],
  [stranger.id, stranger],
]);

const validBody = {
  projectName: "demo-bot",
  tenant: "test" as const,
  commitSha: "abcdef1",
  branch: "test",
};

const emptyPlanOutcome: DryRunOutcome = {
  plan: {
    operations: [],
    summary: {
      assets: { creates: 0, updates: 0, deletes: 0, unchanged: 0 },
      queues: { creates: 0, updates: 0, deletes: 0, unchanged: 0 },
      buckets: { creates: 0, updates: 0, deletes: 0, unchanged: 0 },
    },
  },
};

const emptyApplyOutcome: ApplyOutcome = {
  ...emptyPlanOutcome,
  applyResult: { applied: [], stoppedAt: undefined, success: true },
};

async function buildApp(
  opts: {
    runDryRun?: () => Promise<DryRunOutcome>;
    runApply?: () => Promise<ApplyOutcome>;
  } = {},
) {
  const auditWriter = new InMemoryAuditWriter();
  const authenticator = new TestAuthenticator(users);
  const app = await createApp({
    auditWriter,
    logLevel: "fatal",
    reconcile: {
      authenticator,
      runDryRun: opts.runDryRun ?? (async () => emptyPlanOutcome),
      runApply: opts.runApply ?? (async () => emptyApplyOutcome),
    },
  });
  return { app, auditWriter };
}

describe("POST /reconcile/dry-run", () => {
  it("returns 401 when no actor header is supplied", async () => {
    const { app } = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/reconcile/dry-run",
      payload: validBody,
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("returns 403 when the actor lacks PROJECT_READ", async () => {
    const { app } = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/reconcile/dry-run",
      payload: validBody,
      headers: { "x-test-actor": stranger.id },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "permission_denied" });
    await app.close();
  });

  it("returns 200 with the plan when the actor has PROJECT_READ", async () => {
    const { app } = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/reconcile/dry-run",
      payload: validBody,
      headers: { "x-test-actor": developer.id },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      correlationId: expect.any(String),
      plan: { operations: [], summary: expect.any(Object) },
    });
    await app.close();
  });

  it("returns 400 when the body is malformed", async () => {
    const { app } = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/reconcile/dry-run",
      payload: { tenant: "wrong" },
      headers: { "x-test-actor": developer.id },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });
});

describe("POST /reconcile/apply", () => {
  it("returns 403 when the actor lacks the per-tenant approval permission", async () => {
    const { app } = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/reconcile/apply",
      payload: { ...validBody, tenant: "prod", branch: "main" },
      headers: { "x-test-actor": developer.id },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "permission_denied" });
    await app.close();
  });

  it("returns 200 when the BA approves a prod apply", async () => {
    const { app } = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/reconcile/apply",
      payload: { ...validBody, tenant: "prod", branch: "main" },
      headers: { "x-test-actor": ba.id },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      applyResult: { success: true },
    });
    await app.close();
  });

  it("returns 200 when the developer approves a dev->test apply", async () => {
    const { app } = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/reconcile/apply",
      payload: validBody,
      headers: { "x-test-actor": developer.id },
    });
    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it("invokes runApply with the actor and correlation id", async () => {
    let captured: { actor: UserWithRoles; correlationId: string } | undefined;
    const { app } = await buildApp({
      runApply: async (_body, ctx) => {
        captured = ctx;
        return emptyApplyOutcome;
      },
    });
    await app.inject({
      method: "POST",
      url: "/reconcile/apply",
      payload: validBody,
      headers: { "x-test-actor": developer.id, "x-correlation-id": "corr-xyz" },
    });
    expect(captured?.actor.id).toBe(developer.id);
    expect(captured?.correlationId).toBe("corr-xyz");
    await app.close();
  });
});
