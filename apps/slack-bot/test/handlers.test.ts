import { describe, expect, it } from "vitest";
import {
  configSetHandler,
  editHandler,
  helpHandler,
  statusHandler,
  type SlashCommandContext,
} from "../src/index.js";

function makeCtx(overrides: Partial<SlashCommandContext> = {}): SlashCommandContext & {
  responses: string[];
} {
  const responses: string[] = [];
  return Object.assign(
    {
      input: { command: "/rpa", text: "", slackUserId: "U1", slackChannelId: "C1" },
      actor: {
        id: "u1",
        roles: [{ id: "r1", name: "developer", isSystem: true, permissions: {} }],
      },
      subcommand: "status",
      args: [],
      ack: async () => undefined,
      respond: async (text: string) => {
        responses.push(text);
      },
      ...overrides,
    } satisfies SlashCommandContext,
    { responses },
  );
}

describe("statusHandler", () => {
  it("posts a healthy message that includes the actor id", async () => {
    const ctx = makeCtx();
    await statusHandler(ctx);
    expect(ctx.responses[0]).toContain("up");
    expect(ctx.responses[0]).toContain("u1");
  });
});

describe("editHandler", () => {
  it("returns the spec's v2 deferral message", async () => {
    const ctx = makeCtx();
    await editHandler(ctx);
    expect(ctx.responses[0]).toContain("Inline editing arrives in v2");
  });
});

describe("helpHandler", () => {
  it("lists each documented subcommand", async () => {
    const ctx = makeCtx();
    await helpHandler(ctx);
    const text = ctx.responses[0] ?? "";
    expect(text).toContain("status");
    expect(text).toContain("config set");
    expect(text).toContain("edit");
  });
});

describe("configSetHandler", () => {
  it("rejects when fewer than four args are supplied", async () => {
    const ctx = makeCtx({ args: ["set", "demo-bot"] });
    await configSetHandler(ctx);
    expect(ctx.responses[0]).toContain("Usage");
  });

  it("acknowledges valid args and reports they will route to apps/api", async () => {
    const ctx = makeCtx({ args: ["set", "demo-bot", "dev", "MaxRows", "100"] });
    await configSetHandler(ctx);
    expect(ctx.responses[0]).toContain("demo-bot");
    expect(ctx.responses[0]).toContain("dev");
    expect(ctx.responses[0]).toContain("MaxRows");
  });
});
