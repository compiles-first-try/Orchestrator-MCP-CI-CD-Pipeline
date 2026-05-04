import { describe, expect, it, vi } from "vitest";
import {
  applyHandler,
  editHandler,
  helpHandler,
  reconcileHandler,
  type ApiClient,
} from "../src/commands/handlers.js";
import { parseCommandText } from "../src/commands/parse.js";
import { CommandRouter } from "../src/commands/router.js";

function stubApi(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    reconcileDryRun: vi.fn(),
    reconcileApply: vi.fn(),
    createProject: vi.fn(),
    connectTenant: vi.fn(),
    ...overrides,
  } as ApiClient;
}

function asReply(result: Awaited<ReturnType<CommandRouter["dispatch"]>>): {
  text: string;
  responseType?: "in_channel" | "ephemeral";
} {
  if (result.kind !== "reply") {
    throw new Error(`Expected a reply result, got ${result.kind}`);
  }
  return result;
}

describe("parseCommandText", () => {
  it("splits on whitespace and respects quoted args", () => {
    expect(parseCommandText('reconcile demo-bot "production env"')).toEqual({
      verb: "reconcile",
      args: ["demo-bot", "production env"],
      raw: 'reconcile demo-bot "production env"',
    });
  });
  it("handles empty input", () => {
    expect(parseCommandText("")).toEqual({ verb: "", args: [], raw: "" });
  });
});

describe("CommandRouter", () => {
  it("falls back to ephemeral help when no verb is supplied", async () => {
    const router = new CommandRouter();
    router.register("help", helpHandler);
    const out = asReply(
      await router.dispatch({ userId: "U", userEmail: "u@example.com", channelId: "C", text: "" }),
    );
    expect(out.responseType).toBe("ephemeral");
  });

  it("returns the v2 placeholder for /rpa edit", async () => {
    const router = new CommandRouter();
    router.register("edit", editHandler);
    const out = asReply(
      await router.dispatch({
        userId: "U",
        userEmail: "u@example.com",
        channelId: "C",
        text: "edit",
      }),
    );
    expect(out.text).toContain("v2");
  });

  it("forwards reconcile to the API client", async () => {
    const reconcile = vi.fn().mockResolvedValue({ summary: ":white_check_mark: ok" });
    const router = new CommandRouter();
    router.register("reconcile", reconcileHandler(stubApi({ reconcileDryRun: reconcile })));
    const out = asReply(
      await router.dispatch({
        userId: "U",
        userEmail: "alice@example.com",
        channelId: "C",
        text: "reconcile demo-bot dev",
      }),
    );
    expect(reconcile).toHaveBeenCalledWith({
      callerEmail: "alice@example.com",
      project: "demo-bot",
      tenant: "dev",
    });
    expect(out.text).toContain("ok");
  });

  it("rejects an unknown tenant", async () => {
    const router = new CommandRouter();
    router.register("apply", applyHandler(stubApi()));
    const out = asReply(
      await router.dispatch({
        userId: "U",
        userEmail: "alice@example.com",
        channelId: "C",
        text: "apply demo-bot staging",
      }),
    );
    expect(out.text).toContain("Unknown tenant");
  });

  it("returns an ephemeral message for an unrecognised verb", async () => {
    const router = new CommandRouter();
    const out = asReply(
      await router.dispatch({
        userId: "U",
        userEmail: "u@example.com",
        channelId: "C",
        text: "unknown",
      }),
    );
    expect(out.responseType).toBe("ephemeral");
    expect(out.text).toContain("Unknown command");
  });
});
