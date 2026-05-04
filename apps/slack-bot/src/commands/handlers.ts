import { isTenantName } from "@rpa-platform/shared";
import { openModal, reply, type CommandHandler, type ModalSpec } from "./router.js";

export interface ApiClient {
  reconcileDryRun(args: ReconcileRequest): Promise<{ readonly summary: string }>;
  reconcileApply(args: ReconcileRequest): Promise<{ readonly summary: string }>;
  createProject(args: NewProjectRequest): Promise<{ readonly summary: string }>;
  connectTenant(args: TenantConnectRequest): Promise<{ readonly summary: string }>;
}

export interface TenantConnectRequest {
  readonly callerEmail: string;
  readonly projectName: string;
  readonly tenant: "dev" | "test" | "stage" | "prod";
  readonly clientId: string;
  readonly clientSecret: string;
  readonly folderId: string;
  readonly orchestratorUrl?: string;
  readonly identityTokenUrl: string;
  readonly scopes?: readonly string[];
}

export interface NewProjectRequest {
  readonly callerEmail: string;
  // Free-text intent — bot forwards the full /rpa new <text> payload to
  // the API which delegates to the IntentParser.
  readonly text: string;
}

export interface ReconcileRequest {
  readonly callerEmail: string;
  readonly project: string;
  readonly tenant: "dev" | "test" | "stage" | "prod";
}

export const helpHandler: CommandHandler = async () =>
  reply(
    [
      "*rpa-platform commands*",
      "`/rpa list` — list projects",
      "`/rpa info <project>` — project metadata",
      "`/rpa reconcile <project> <tenant>` — dry-run reconcile against an Orchestrator tenant",
      "`/rpa apply <project> <tenant>` — apply a reconcile (requires approval where applicable)",
      "`/rpa new <name> \"desc\" owners=<email>` — provision a new project repo from the framework template",
      "`/rpa tenant connect` — opens a secure form to wire a tenant's OAuth credentials",
      "`/rpa edit` — *(arrives in v2 — for now, edit on your machine and commit)*",
      "`/rpa help` — this message",
    ].join("\n"),
    "ephemeral",
  );

// `/rpa edit` placeholder per spec scope discipline.
export const editHandler: CommandHandler = async () =>
  reply("Inline editing arrives in v2 — for now, edit on your machine and commit.", "ephemeral");

// `/rpa tenant connect` opens a secure modal — credentials never appear in
// channel text, slash-command history, or audit logs as visible strings.
// See memory: no_secrets_in_chat for the rationale.
//
// Subverbs other than `connect` (e.g. a future `/rpa tenant disconnect`) get
// dispatched here so the verb stays unified.
export const TENANT_CONNECT_MODAL_CALLBACK = "tenant_connect_submit";

export function tenantConnectHandler(): CommandHandler {
  return async (context, args) => {
    const subverb = args[0] ?? "";
    if (subverb !== "connect") {
      return reply(
        "Usage: `/rpa tenant connect` (opens a secure form). Other tenant subverbs are not yet implemented.",
        "ephemeral",
      );
    }
    if (context.userEmail === undefined) {
      return reply("Could not resolve your Slack email.", "ephemeral");
    }
    const modal = buildTenantConnectModal(context.userEmail);
    return openModal(modal);
  };
}

function buildTenantConnectModal(callerEmail: string): ModalSpec {
  return {
    callbackId: TENANT_CONNECT_MODAL_CALLBACK,
    title: "Connect tenant credentials",
    submitText: "Connect",
    privateMetadata: JSON.stringify({ callerEmail }),
    fields: [
      {
        key: "project",
        label: "Project name",
        placeholder: "demo-bot",
        required: true,
        hint: "Must match the project name registered via `/rpa new`.",
      },
      {
        key: "tenant",
        label: "Tenant",
        placeholder: "dev | test | stage | prod",
        required: true,
      },
      {
        key: "client_id",
        label: "OAuth2 client ID",
        required: true,
        hint: "From Orchestrator → External Applications.",
      },
      {
        key: "client_secret",
        label: "OAuth2 client secret",
        required: true,
        hint: "Slack does not mask this field while you type. The value is sent over Slack's encrypted view-submission RPC, never to the channel — but consider pasting from a password manager rather than typing it in plaintext on screen.",
      },
      {
        key: "folder_id",
        label: "Orchestrator folder ID",
        required: true,
        placeholder: "1",
      },
      {
        key: "identity_token_url",
        label: "Identity token URL",
        required: true,
        placeholder: "https://cloud.uipath.com/{org}/identity_/connect/token",
      },
      {
        key: "orchestrator_url",
        label: "Orchestrator base URL (optional)",
        placeholder: "https://cloud.uipath.com/{org}/{tenant}/orchestrator_",
      },
      {
        key: "scopes",
        label: "OAuth scopes (comma-separated, optional)",
        placeholder: "OR.Default, OR.Assets, OR.Queues",
        initialValue: "OR.Default",
      },
    ],
  };
}

// Called from the Slack view_submission handler in apps/slack-bot/src/index.ts
// after Slack POSTs the modal contents back. This shape is what the API's
// /tenants/connect route expects; we extract directly from the form fields.
export interface ParsedTenantConnectSubmission {
  readonly callerEmail: string;
  readonly request: TenantConnectRequest;
  readonly errors?: Readonly<Record<string, string>>;
}

export function parseTenantConnectSubmission(
  privateMetadata: string,
  fieldValues: Readonly<Record<string, string | undefined>>,
): ParsedTenantConnectSubmission {
  const meta = safeParseMetadata(privateMetadata);
  const callerEmail = meta.callerEmail;
  const errors: Record<string, string> = {};

  const project = (fieldValues["project"] ?? "").trim();
  const tenant = (fieldValues["tenant"] ?? "").trim().toLowerCase();
  const clientId = (fieldValues["client_id"] ?? "").trim();
  // NB: client_secret is intentionally not trimmed — leading/trailing spaces
  // could be part of a (poor) secret and we shouldn't silently strip them.
  const clientSecret = fieldValues["client_secret"] ?? "";
  const folderId = (fieldValues["folder_id"] ?? "").trim();
  const identityTokenUrl = (fieldValues["identity_token_url"] ?? "").trim();
  const orchestratorUrl = (fieldValues["orchestrator_url"] ?? "").trim();
  const scopesRaw = (fieldValues["scopes"] ?? "").trim();

  if (project === "") errors["project"] = "Required.";
  if (!isTenantName(tenant)) {
    errors["tenant"] = "Must be one of dev, test, stage, prod.";
  }
  if (clientId === "") errors["client_id"] = "Required.";
  if (clientSecret === "") errors["client_secret"] = "Required.";
  if (folderId === "") errors["folder_id"] = "Required.";
  if (identityTokenUrl === "") errors["identity_token_url"] = "Required.";

  const scopes =
    scopesRaw === ""
      ? undefined
      : scopesRaw.split(",").map((s) => s.trim()).filter((s) => s.length > 0);

  const request: TenantConnectRequest = {
    callerEmail,
    projectName: project,
    tenant: (isTenantName(tenant) ? tenant : "dev") as TenantConnectRequest["tenant"],
    clientId,
    clientSecret,
    folderId,
    identityTokenUrl,
    ...(orchestratorUrl !== "" && { orchestratorUrl }),
    ...(scopes !== undefined && { scopes }),
  };

  if (Object.keys(errors).length > 0) {
    return { callerEmail, request, errors };
  }
  return { callerEmail, request };
}

function safeParseMetadata(raw: string): { callerEmail: string } {
  try {
    const parsed = JSON.parse(raw) as { callerEmail?: unknown };
    return {
      callerEmail: typeof parsed.callerEmail === "string" ? parsed.callerEmail : "",
    };
  } catch {
    return { callerEmail: "" };
  }
}

// `/rpa new <project> "<description>" owners=<email>[,<email>] [framework=x.y.z]`
// Forwards the entire post-verb payload as free text — the API parses it
// with the configurable IntentParser. Admin-only (PROJECT_PROVISION).
export function newProjectHandler(api: ApiClient): CommandHandler {
  return async (context, args) => {
    if (args.length === 0) {
      return reply(
        "Usage: `/rpa new <project-name> \"description\" owners=<email>` (admin only).",
        "ephemeral",
      );
    }
    if (context.userEmail === undefined) {
      return reply("Could not resolve your Slack email.", "ephemeral");
    }
    const result = await api.createProject({
      callerEmail: context.userEmail,
      text: args.join(" "),
    });
    return reply(result.summary);
  };
}

export function reconcileHandler(api: ApiClient): CommandHandler {
  return async (context, args) => {
    const [project, tenant] = args;
    if (project === undefined || tenant === undefined) {
      return reply("Usage: `/rpa reconcile <project> <tenant>`", "ephemeral");
    }
    if (!isTenantName(tenant)) {
      return reply(
        `Unknown tenant '${tenant}'. Expected one of: dev, test, stage, prod.`,
        "ephemeral",
      );
    }
    if (context.userEmail === undefined) {
      return reply("Could not resolve your Slack email.", "ephemeral");
    }
    const result = await api.reconcileDryRun({
      callerEmail: context.userEmail,
      project,
      tenant,
    });
    return reply(result.summary);
  };
}

export function applyHandler(api: ApiClient): CommandHandler {
  return async (context, args) => {
    const [project, tenant] = args;
    if (project === undefined || tenant === undefined) {
      return reply("Usage: `/rpa apply <project> <tenant>`", "ephemeral");
    }
    if (!isTenantName(tenant)) {
      return reply(
        `Unknown tenant '${tenant}'. Expected one of: dev, test, stage, prod.`,
        "ephemeral",
      );
    }
    if (context.userEmail === undefined) {
      return reply("Could not resolve your Slack email.", "ephemeral");
    }
    const result = await api.reconcileApply({
      callerEmail: context.userEmail,
      project,
      tenant,
    });
    return reply(result.summary);
  };
}
