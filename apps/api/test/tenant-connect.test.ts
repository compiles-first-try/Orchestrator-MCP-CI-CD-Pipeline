import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { decryptSecret } from "@rpa-platform/shared";
import {
  TenantConnectError,
  TenantConnectService,
} from "../src/services/tenant-connect.js";
import type { ProjectRepo } from "../src/db-adapters/projects.js";
import type { ProjectTenantRepo } from "../src/db-adapters/project-tenants.js";

function fakeProjectRepo(initial: Record<string, { id: string }> = { "demo-bot": { id: "proj-1" } }): ProjectRepo {
  return {
    async getByName(name: string) {
      return initial[name] as never;
    },
    async list() {
      return [] as never;
    },
    async create() {
      return { id: "x" } as never;
    },
  } as unknown as ProjectRepo;
}

function fakeProjectTenantRepo(): { repo: ProjectTenantRepo; upserts: unknown[] } {
  const upserts: unknown[] = [];
  return {
    upserts,
    repo: {
      async upsert(row: unknown) {
        upserts.push(row);
      },
      async get() {
        return undefined;
      },
      async listForProject() {
        return [];
      },
    } as unknown as ProjectTenantRepo,
  };
}

const KEY = randomBytes(32);

const VALID_TOKEN_RESPONSE = new Response(
  JSON.stringify({ access_token: "abc", token_type: "Bearer", expires_in: 3600 }),
  { status: 200, headers: { "Content-Type": "application/json" } },
);

describe("TenantConnectService.connect", () => {
  let projects: ProjectRepo;
  let tenants: ReturnType<typeof fakeProjectTenantRepo>;
  beforeEach(() => {
    projects = fakeProjectRepo();
    tenants = fakeProjectTenantRepo();
  });

  it("validates credentials, encrypts the secret, and upserts the row as connected", async () => {
    const fetchMock = vi.fn().mockResolvedValue(VALID_TOKEN_RESPONSE);
    const service = new TenantConnectService({
      projects,
      projectTenants: tenants.repo,
      encryptionKey: KEY,
      fetch: fetchMock as unknown as typeof fetch,
    });
    const result = await service.connect({
      projectName: "demo-bot",
      tenant: "dev",
      clientId: "id",
      clientSecret: "secret-123",
      folderId: "1",
      identityTokenUrl: "https://cloud.uipath.com/o/identity_/connect/token",
      scopes: ["OR.Default"],
    });
    expect(result.status).toBe("connected");
    expect(result.tokenLifetimeSeconds).toBe(3600);
    expect(tenants.upserts).toHaveLength(1);
    const upserted = tenants.upserts[0] as { oauthClientSecretEncrypted: string };
    expect(decryptSecret(upserted.oauthClientSecretEncrypted, KEY)).toBe("secret-123");
  });

  it("does not persist when validation fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("invalid_client", { status: 401 }));
    const service = new TenantConnectService({
      projects,
      projectTenants: tenants.repo,
      encryptionKey: KEY,
      fetch: fetchMock as unknown as typeof fetch,
    });
    await expect(
      service.connect({
        projectName: "demo-bot",
        tenant: "dev",
        clientId: "id",
        clientSecret: "wrong-secret",
        folderId: "1",
        identityTokenUrl: "https://cloud.uipath.com/o/identity_/connect/token",
        scopes: ["OR.Default"],
      }),
    ).rejects.toBeInstanceOf(TenantConnectError);
    expect(tenants.upserts).toHaveLength(0);
  });

  it("skips validation when validate=false", async () => {
    const fetchMock = vi.fn();
    const service = new TenantConnectService({
      projects,
      projectTenants: tenants.repo,
      encryptionKey: KEY,
      fetch: fetchMock as unknown as typeof fetch,
    });
    const result = await service.connect({
      projectName: "demo-bot",
      tenant: "dev",
      clientId: "id",
      clientSecret: "secret",
      folderId: "1",
      identityTokenUrl: "https://cloud.uipath.com/o/identity_/connect/token",
      scopes: ["OR.Default"],
      validate: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.status).toBe("connected");
    expect(tenants.upserts).toHaveLength(1);
  });

  it("rejects an unregistered project with tenant.connect_project_not_found", async () => {
    const service = new TenantConnectService({
      projects: fakeProjectRepo({}), // no projects
      projectTenants: tenants.repo,
      encryptionKey: KEY,
    });
    let caught: unknown;
    try {
      await service.connect({
        projectName: "ghost",
        tenant: "dev",
        clientId: "id",
        clientSecret: "x",
        folderId: "1",
        identityTokenUrl: "https://cloud.uipath.com/o/identity_/connect/token",
        scopes: ["OR.Default"],
        validate: false,
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(TenantConnectError);
    if (caught instanceof TenantConnectError) {
      expect(caught.code).toBe("tenant.connect_project_not_found");
    }
  });
});
