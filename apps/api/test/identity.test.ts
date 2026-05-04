import { describe, expect, it, vi } from "vitest";
import type { OrchestratorClient } from "@rpa-platform/orchestrator-client";
import { SYSTEM_ROLES } from "@rpa-platform/shared";
import {
  createHarvardFuzzyIdentityResolver,
  createIdentityResolver,
} from "../src/identity.js";

const SYS = {
  developer: { id: "developer", name: "developer", isSystem: true, permissions: SYSTEM_ROLES.developer },
  admin: { id: "admin", name: "admin", isSystem: true, permissions: SYSTEM_ROLES.admin },
  ba: { id: "ba", name: "ba", isSystem: true, permissions: SYSTEM_ROLES.ba },
} as const;

function fakeOrchestrator(impl: {
  getByEmail: (email: string) => Promise<unknown>;
  list?: () => Promise<unknown>;
  listRoles: (id: number) => Promise<unknown>;
}): OrchestratorClient {
  return {
    users: {
      getByEmail: vi.fn(impl.getByEmail),
      list: vi.fn(impl.list ?? (async () => [])),
      listRoles: vi.fn(impl.listRoles),
    },
  } as unknown as OrchestratorClient;
}

describe("createIdentityResolver", () => {
  it("maps Orchestrator roles to system roles via the default mapping", async () => {
    const orchestrator = fakeOrchestrator({
      async getByEmail() {
        return { Id: 7, EmailAddress: "alice@harvard.edu", Name: "Alice", Surname: "Smith" };
      },
      async listRoles() {
        return [{ Id: 1, Name: "Administrator" }];
      },
    });
    const resolver = createIdentityResolver({ orchestrator, systemRoles: SYS });
    const identity = await resolver.resolveBySlackEmail("alice@harvard.edu");
    expect(identity?.user.roles.map((r) => r.name)).toEqual(["admin"]);
    expect(identity?.orchestratorRoleNames).toEqual(["Administrator"]);
    expect(identity?.orchestratorUserId).toBe(7);
  });

  it("returns undefined when Orchestrator has no matching user", async () => {
    const orchestrator = fakeOrchestrator({
      async getByEmail() {
        return undefined;
      },
      async listRoles() {
        return [];
      },
    });
    const resolver = createIdentityResolver({ orchestrator, systemRoles: SYS });
    expect(await resolver.resolveBySlackEmail("ghost@harvard.edu")).toBeUndefined();
  });
});

describe("createHarvardFuzzyIdentityResolver", () => {
  it("falls back to fuzzy match when exact email lookup fails", async () => {
    const orchestrator = fakeOrchestrator({
      async getByEmail() {
        return undefined;
      },
      async list() {
        return [
          { Id: 11, EmailAddress: "asmith@partners.org", Name: "Alice", Surname: "Smith", IsActive: true },
          { Id: 12, EmailAddress: "bbob@elsewhere.com", Name: "Bob", Surname: "Bobson", IsActive: true },
        ];
      },
      async listRoles() {
        return [{ Id: 1, Name: "Developer" }];
      },
    });
    const resolver = createHarvardFuzzyIdentityResolver({ orchestrator, systemRoles: SYS });
    const identity = await resolver.resolveBySlackEmail("alice.smith@hms.harvard.edu");
    expect(identity?.orchestratorUserId).toBe(11);
    expect(identity?.orchestratorRoleNames).toEqual(["Developer"]);
  });

  it("rejects emails whose domain does not contain 'harvard'", async () => {
    const orchestrator = fakeOrchestrator({
      async getByEmail() {
        return undefined;
      },
      async list() {
        return [{ Id: 11, EmailAddress: "asmith@harvard.edu", Name: "Alice", Surname: "Smith", IsActive: true }];
      },
      async listRoles() {
        return [];
      },
    });
    const resolver = createHarvardFuzzyIdentityResolver({ orchestrator, systemRoles: SYS });
    expect(await resolver.resolveBySlackEmail("alice.smith@gmail.com")).toBeUndefined();
  });

  it("matches by surname when the local part contains it", async () => {
    const orchestrator = fakeOrchestrator({
      async getByEmail() {
        return undefined;
      },
      async list() {
        return [{ Id: 11, EmailAddress: "x@x.com", Name: "Alice", Surname: "Smith", IsActive: true }];
      },
      async listRoles() {
        return [{ Id: 1, Name: "Developer" }];
      },
    });
    const resolver = createHarvardFuzzyIdentityResolver({ orchestrator, systemRoles: SYS });
    const identity = await resolver.resolveBySlackEmail("smith.bot@harvard.edu");
    expect(identity?.orchestratorUserId).toBe(11);
  });

  it("invokes onAmbiguous when multiple users match", async () => {
    const onAmbiguous = vi.fn();
    const orchestrator = fakeOrchestrator({
      async getByEmail() {
        return undefined;
      },
      async list() {
        return [
          { Id: 11, EmailAddress: "a@a.com", Name: "Alice", Surname: "Smith", IsActive: true },
          { Id: 12, EmailAddress: "b@b.com", Name: "Alice", Surname: "Jones", IsActive: true },
        ];
      },
      async listRoles() {
        return [];
      },
    });
    const resolver = createHarvardFuzzyIdentityResolver({ orchestrator, systemRoles: SYS }, {}, onAmbiguous);
    const identity = await resolver.resolveBySlackEmail("alice@harvard.edu");
    expect(identity?.orchestratorUserId).toBe(11);
    expect(onAmbiguous).toHaveBeenCalledTimes(1);
  });

  it("ignores extremely short name parts to avoid spurious matches", async () => {
    const orchestrator = fakeOrchestrator({
      async getByEmail() {
        return undefined;
      },
      async list() {
        return [{ Id: 11, EmailAddress: "x@x.com", Name: "A", Surname: "B", IsActive: true }];
      },
      async listRoles() {
        return [];
      },
    });
    const resolver = createHarvardFuzzyIdentityResolver({ orchestrator, systemRoles: SYS });
    expect(await resolver.resolveBySlackEmail("anything@harvard.edu")).toBeUndefined();
  });
});
