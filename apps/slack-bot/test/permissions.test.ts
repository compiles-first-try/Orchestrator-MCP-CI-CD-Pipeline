import { describe, expect, it } from "vitest";
import {
  PERMISSIONS,
  type Role,
  type RolePermissions,
  type UserWithRoles,
} from "@rpa-platform/shared";
import { withPermission, type SlashCommandContext } from "../src/index.js";

function makeUser(permissions: RolePermissions): UserWithRoles {
  const role: Role = { id: "r", name: "r", isSystem: false, permissions };
  return { id: "u", roles: [role] };
}

function makeCtx(
  actor: UserWithRoles,
  args: string[] = [],
): SlashCommandContext & {
  responses: string[];
} {
  const responses: string[] = [];
  return Object.assign(
    {
      input: { command: "/rpa", text: "", slackUserId: "U", slackChannelId: "C" },
      actor,
      subcommand: "config",
      args,
      ack: async () => undefined,
      respond: async (text: string) => {
        responses.push(text);
      },
    } satisfies SlashCommandContext,
    { responses },
  );
}

describe("withPermission", () => {
  it("invokes the wrapped handler when can() is true", async () => {
    const allowed = makeUser({ [PERMISSIONS.CONFIG_QUICK_EDIT]: { tenants: ["dev"] } });
    let called = false;
    const guarded = withPermission(
      PERMISSIONS.CONFIG_QUICK_EDIT,
      async () => {
        called = true;
      },
      () => ({ tenant: "dev" }),
    );
    await guarded(makeCtx(allowed));
    expect(called).toBe(true);
  });

  it("blocks with a friendly message when can() is false", async () => {
    const denied = makeUser({});
    const guarded = withPermission(
      PERMISSIONS.CONFIG_QUICK_EDIT,
      async () => {
        throw new Error("should not be called");
      },
      () => ({ tenant: "prod" }),
    );
    const ctx = makeCtx(denied);
    await guarded(ctx);
    expect(ctx.responses[0]).toContain("permission");
    expect(ctx.responses[0]).toContain("prod");
  });

  it("blocks when the actor has the permission for a different tenant only", async () => {
    const devOnly = makeUser({ [PERMISSIONS.CONFIG_QUICK_EDIT]: { tenants: ["dev"] } });
    const guarded = withPermission(
      PERMISSIONS.CONFIG_QUICK_EDIT,
      async (ctx) => {
        await ctx.respond("ran");
      },
      () => ({ tenant: "prod" }),
    );
    const ctx = makeCtx(devOnly);
    await guarded(ctx);
    expect(ctx.responses[0]).toContain("permission");
  });
});
