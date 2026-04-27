import { describe, expect, it } from "vitest";
import { CommandRouter, type CommandHandler, type SlashCommandContext } from "../src/index.js";

function makeCtx(overrides: Partial<SlashCommandContext> = {}): SlashCommandContext & {
  responses: string[];
} {
  const responses: string[] = [];
  const ctx: SlashCommandContext = {
    input: {
      command: "/rpa",
      text: "",
      slackUserId: "U1",
      slackChannelId: "C1",
    },
    actor: { id: "u1", roles: [] },
    subcommand: "help",
    args: [],
    ack: async () => undefined,
    respond: async (text) => {
      responses.push(text);
    },
    ...overrides,
  };
  return Object.assign(ctx, { responses });
}

describe("CommandRouter", () => {
  it("dispatches to a registered handler", async () => {
    const router = new CommandRouter();
    let called = false;
    const handler: CommandHandler = async () => {
      called = true;
    };
    router.register("status", handler);
    const ctx = makeCtx({ subcommand: "status" });
    await router.dispatch(ctx);
    expect(called).toBe(true);
  });

  it("falls back with an unknown-subcommand response by default", async () => {
    const router = new CommandRouter();
    const ctx = makeCtx({ subcommand: "nope" });
    await router.dispatch(ctx);
    expect(ctx.responses).toHaveLength(1);
    expect(ctx.responses[0]).toContain("Unknown subcommand");
  });

  it("uses a custom fallback when set", async () => {
    const router = new CommandRouter();
    router.setFallback(async (ctx) => {
      await ctx.respond("custom fallback");
    });
    const ctx = makeCtx({ subcommand: "x" });
    await router.dispatch(ctx);
    expect(ctx.responses[0]).toBe("custom fallback");
  });
});
