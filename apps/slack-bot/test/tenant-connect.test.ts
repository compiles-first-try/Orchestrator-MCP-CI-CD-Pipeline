import { describe, expect, it } from "vitest";
import {
  TENANT_CONNECT_MODAL_CALLBACK,
  parseTenantConnectSubmission,
  tenantConnectHandler,
} from "../src/commands/handlers.js";
import { buildSlackModalView, extractFieldValues } from "../src/modal-view.js";

const CONTEXT = {
  userId: "U1",
  userEmail: "admin@harvard.edu",
  channelId: "C1",
  text: "tenant connect",
};

describe("tenantConnectHandler — opens a modal instead of accepting secrets in chat", () => {
  it("returns an open_modal result for `/rpa tenant connect`", async () => {
    const result = await tenantConnectHandler()(CONTEXT, ["connect"]);
    expect(result.kind).toBe("open_modal");
    if (result.kind === "open_modal") {
      expect(result.modal.callbackId).toBe(TENANT_CONNECT_MODAL_CALLBACK);
      const fieldKeys = result.modal.fields.map((f) => f.key);
      expect(fieldKeys).toEqual([
        "project",
        "tenant",
        "client_id",
        "client_secret",
        "folder_id",
        "identity_token_url",
        "orchestrator_url",
        "scopes",
      ]);
      // Caller identity stashed in private_metadata so the view-submission
      // handler can attribute the action without re-resolving Slack→email.
      expect(result.modal.privateMetadata).toBeDefined();
      const meta = JSON.parse(result.modal.privateMetadata ?? "{}") as { callerEmail: string };
      expect(meta.callerEmail).toBe("admin@harvard.edu");
    }
  });

  it("does NOT accept the client_secret as a slash-command arg", async () => {
    // Even if the user (out of habit or copy/paste) types extra args, the
    // handler routes them all to `Usage:` and never invokes the API.
    const result = await tenantConnectHandler()(CONTEXT, [
      "connect",
      "demo-bot",
      "dev",
      "client_secret=THIS_SHOULD_NEVER_BE_PARSED",
    ]);
    expect(result.kind).toBe("open_modal");
  });

  it("rejects non-`connect` subverbs with an ephemeral message", async () => {
    const result = await tenantConnectHandler()(CONTEXT, ["disconnect"]);
    expect(result.kind).toBe("reply");
    if (result.kind === "reply") {
      expect(result.responseType).toBe("ephemeral");
    }
  });
});

describe("parseTenantConnectSubmission — extract values from view_submission", () => {
  it("returns a clean TenantConnectRequest when fields are valid", () => {
    const parsed = parseTenantConnectSubmission(
      JSON.stringify({ callerEmail: "admin@harvard.edu" }),
      {
        project: "demo-bot",
        tenant: "dev",
        client_id: "id",
        client_secret: "secret-value",
        folder_id: "1",
        identity_token_url: "https://cloud.uipath.com/o/identity_/connect/token",
        orchestrator_url: "",
        scopes: "OR.Default, OR.Assets",
      },
    );
    expect(parsed.errors).toBeUndefined();
    expect(parsed.request).toEqual({
      callerEmail: "admin@harvard.edu",
      projectName: "demo-bot",
      tenant: "dev",
      clientId: "id",
      clientSecret: "secret-value",
      folderId: "1",
      identityTokenUrl: "https://cloud.uipath.com/o/identity_/connect/token",
      scopes: ["OR.Default", "OR.Assets"],
    });
  });

  it("returns errors when required fields are missing — and does NOT silently default the secret", () => {
    const parsed = parseTenantConnectSubmission(
      JSON.stringify({ callerEmail: "admin@harvard.edu" }),
      {
        project: "demo-bot",
        tenant: "dev",
        client_id: "id",
        client_secret: "",
        folder_id: "1",
        identity_token_url: "https://x.example.com/token",
      },
    );
    expect(parsed.errors).toBeDefined();
    expect(parsed.errors?.["client_secret"]).toBeDefined();
  });

  it("rejects an unknown tenant value", () => {
    const parsed = parseTenantConnectSubmission(
      JSON.stringify({ callerEmail: "admin@harvard.edu" }),
      {
        project: "demo-bot",
        tenant: "staging",
        client_id: "id",
        client_secret: "x",
        folder_id: "1",
        identity_token_url: "https://x.example.com/token",
      },
    );
    expect(parsed.errors?.["tenant"]).toBeDefined();
  });

  it("preserves leading/trailing whitespace in client_secret (might be part of a secret)", () => {
    const parsed = parseTenantConnectSubmission(
      JSON.stringify({ callerEmail: "admin@harvard.edu" }),
      {
        project: "demo-bot",
        tenant: "dev",
        client_id: "id",
        client_secret: "  spaces-around  ",
        folder_id: "1",
        identity_token_url: "https://x.example.com/token",
      },
    );
    expect(parsed.errors).toBeUndefined();
    expect(parsed.request.clientSecret).toBe("  spaces-around  ");
  });
});

describe("buildSlackModalView — Slack Block Kit shape", () => {
  it("produces a valid view payload with type=modal and submit/cancel buttons", () => {
    const view = buildSlackModalView({
      callbackId: "test_modal",
      title: "Test",
      fields: [{ key: "alpha", label: "Alpha", required: true }],
    }) as Record<string, unknown>;
    expect(view.type).toBe("modal");
    expect(view.callback_id).toBe("test_modal");
    expect((view.title as { text: string }).text).toBe("Test");
    expect((view.submit as { text: string }).text).toBe("Submit");
    expect(Array.isArray(view.blocks)).toBe(true);
  });

  it("rejects private_metadata over Slack's 2500-char limit", () => {
    expect(() =>
      buildSlackModalView({
        callbackId: "x",
        title: "x",
        fields: [],
        privateMetadata: "a".repeat(2501),
      }),
    ).toThrow();
  });

  it("renders required vs optional fields correctly", () => {
    const view = buildSlackModalView({
      callbackId: "x",
      title: "x",
      fields: [
        { key: "req", label: "Required", required: true },
        { key: "opt", label: "Optional" },
      ],
    }) as { blocks: { block_id: string; optional: boolean }[] };
    const required = view.blocks.find((b) => b.block_id === "req");
    const optional = view.blocks.find((b) => b.block_id === "opt");
    expect(required?.optional).toBe(false);
    expect(optional?.optional).toBe(true);
  });
});

describe("extractFieldValues — flatten Slack view.state.values", () => {
  it("collapses block_id → action_id → value into { [key]: value }", () => {
    const view = {
      state: {
        values: {
          project: { value: { value: "demo-bot" } },
          client_secret: { value: { value: "the-secret" } },
        },
      },
    };
    const fields = extractFieldValues(view);
    expect(fields).toEqual({ project: "demo-bot", client_secret: "the-secret" });
  });

  it("returns undefined for null values", () => {
    const view = {
      state: { values: { x: { value: { value: null } } } },
    };
    expect(extractFieldValues(view)).toEqual({ x: undefined });
  });

  it("ignores blocks that don't use the conventional `value` action_id", () => {
    const view = {
      state: { values: { x: { other_action: { value: "ignored" } } } },
    };
    expect(extractFieldValues(view)).toEqual({});
  });
});
