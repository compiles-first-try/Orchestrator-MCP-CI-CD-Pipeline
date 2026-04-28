import {
  parseAssets,
  parseBuckets,
  parseConstants,
  parseCredentials,
  parseOverrides,
  parseProjectConfig,
  parseQueues,
  parseSettings,
  type ProjectConfig,
} from "@rpa-platform/config-schema";
import type { CredentialSource } from "@rpa-platform/credential-source";
import type { GitHubApi, RepoRef } from "@rpa-platform/github-client";
import { OrchestratorClient, TokenManager, type FetchFn } from "@rpa-platform/orchestrator-client";
import {
  applyPlan,
  planReconcile,
  type AppliedOperation,
  type ReconcileInput,
} from "@rpa-platform/reconciler";
import { RpaPlatformError, type TenantName } from "@rpa-platform/shared";
import type { ApplyOutcome, DryRunOutcome } from "./reconcile.js";
import type { ApplyRunner, DryRunRunner, ReconcileRequestBody } from "./reconcile.js";
import type { ReconcileContext } from "./reconcile.js";
import type { AuditEntry, AuditWriter } from "./audit.js";
import {
  parseRepoUrl,
  type ProjectLookup,
  type ProjectRow,
  type TenantRow,
} from "./project-lookup.js";

const PROJECT_FILES = [
  "settings.json",
  "constants.json",
  "assets.json",
  "queues.json",
  "buckets.json",
  "credentials.json",
  "overrides.json",
] as const;

type ProjectFileName = (typeof PROJECT_FILES)[number];

export interface ReconcileRunnerDeps {
  readonly projects: ProjectLookup;
  readonly github: GitHubApi;
  readonly credentialSource: CredentialSource;
  readonly auditWriter: AuditWriter;
  readonly encryptionKey: Buffer;
  readonly identityTokenUrl: (tenant: TenantRow) => string;
  readonly oauthScopes?: readonly string[];
  readonly fetch?: FetchFn;
}

export class ProjectNotFoundError extends RpaPlatformError {
  constructor(name: string) {
    super("project.not_found", `Project '${name}' is not registered.`, {
      details: { name },
    });
  }
}

export class TenantNotFoundError extends RpaPlatformError {
  constructor(projectName: string, tenant: TenantName) {
    super(
      "project.tenant_not_found",
      `Project '${projectName}' has no '${tenant}' tenant configured.`,
      { details: { projectName, tenant } },
    );
  }
}

export class ProjectFileMissingError extends RpaPlatformError {
  constructor(file: string, branch: string, commitSha: string) {
    super(
      "project.file_missing",
      `Required project file '${file}' is missing at ${branch}@${commitSha}.`,
      { details: { file, branch, commitSha } },
    );
  }
}

export class TenantNotConfiguredForOAuthError extends RpaPlatformError {
  constructor(projectName: string, tenant: TenantName) {
    super(
      "project.tenant_oauth_not_configured",
      `Tenant '${tenant}' on '${projectName}' is missing OAuth credentials.`,
      { details: { projectName, tenant } },
    );
  }
}

export function createReconcileRunners(deps: ReconcileRunnerDeps): {
  runDryRun: DryRunRunner;
  runApply: ApplyRunner;
} {
  return {
    runDryRun: async (body, context) => runDryRun(deps, body, context),
    runApply: async (body, context) => runApply(deps, body, context),
  };
}

async function runDryRun(
  deps: ReconcileRunnerDeps,
  body: ReconcileRequestBody,
  context: ReconcileContext,
): Promise<DryRunOutcome> {
  const prepared = await prepareReconcile(deps, body, context);
  try {
    const plan = await planReconcile(prepared.input);
    await deps.auditWriter.write(
      buildAuditEntry({
        action: "reconcile.dry_run",
        context,
        body,
        success: true,
        after: plan.summary,
      }),
    );
    await prepared.cleanup();
    return { plan };
  } catch (err) {
    await deps.auditWriter.write(
      buildAuditEntry({
        action: "reconcile.dry_run",
        context,
        body,
        success: false,
        error: describeError(err),
      }),
    );
    await prepared.cleanup();
    throw err;
  }
}

async function runApply(
  deps: ReconcileRunnerDeps,
  body: ReconcileRequestBody,
  context: ReconcileContext,
): Promise<ApplyOutcome> {
  const prepared = await prepareReconcile(deps, body, context);
  try {
    const plan = await planReconcile(prepared.input);
    const result = await applyPlan(prepared.input, plan);
    for (const applied of result.applied) {
      await deps.auditWriter.write(perOperationAuditEntry(applied, body, context));
    }
    await deps.auditWriter.write(
      buildAuditEntry({
        action: "reconcile.apply",
        context,
        body,
        success: result.success,
        after: { summary: plan.summary, stoppedAt: result.stoppedAt },
      }),
    );
    await prepared.cleanup();
    return { plan, applyResult: result };
  } catch (err) {
    await deps.auditWriter.write(
      buildAuditEntry({
        action: "reconcile.apply",
        context,
        body,
        success: false,
        error: describeError(err),
      }),
    );
    await prepared.cleanup();
    throw err;
  }
}

interface PreparedReconcile {
  readonly input: ReconcileInput;
  readonly cleanup: () => Promise<void>;
}

async function prepareReconcile(
  deps: ReconcileRunnerDeps,
  body: ReconcileRequestBody,
  context: ReconcileContext,
): Promise<PreparedReconcile> {
  const project = await deps.projects.byName(body.projectName);
  if (project === undefined) throw new ProjectNotFoundError(body.projectName);
  const tenant = project.tenants.get(body.tenant);
  if (tenant === undefined) throw new TenantNotFoundError(project.name, body.tenant);

  const desired = await loadDesiredConfig(deps.github, project, body);

  const client = await buildOrchestratorClient(deps, project, tenant, body.tenant);

  const input: ReconcileInput = {
    projectId: project.id,
    projectName: project.name,
    tenant: body.tenant,
    tenantStatus: tenant.status,
    desired,
    clients: {
      assets: client.assets,
      queueDefinitions: client.queueDefinitions,
      buckets: client.buckets,
    },
    credentialSource: deps.credentialSource,
    correlationId: context.correlationId,
  };

  return {
    input,
    cleanup: async () => {
      await client.shutdown();
    },
  };
}

async function loadDesiredConfig(
  github: GitHubApi,
  project: ProjectRow,
  body: ReconcileRequestBody,
): Promise<ProjectConfig> {
  const repo: RepoRef = parseRepoUrl(project.repoUrl);
  const lookups = await github.getMultipleFiles(repo, [...PROJECT_FILES], body.commitSha);
  const byName = new Map<ProjectFileName, string>();
  for (const lookup of lookups) {
    if ("content" in lookup) {
      byName.set(lookup.path as ProjectFileName, lookup.content);
    }
  }
  const required: ProjectFileName[] = ["settings.json", "constants.json", "assets.json"];
  for (const name of required) {
    if (byName.has(name) === false) {
      throw new ProjectFileMissingError(name, body.branch, body.commitSha);
    }
  }
  return parseProjectConfig({
    settings: parseSettings(JSON.parse(byName.get("settings.json") ?? "{}")),
    constants: parseConstants(JSON.parse(byName.get("constants.json") ?? "{}")),
    assets: parseAssets(JSON.parse(byName.get("assets.json") ?? "[]")),
    queues: parseQueues(JSON.parse(byName.get("queues.json") ?? "[]")),
    buckets: parseBuckets(JSON.parse(byName.get("buckets.json") ?? "[]")),
    credentials: parseCredentials(JSON.parse(byName.get("credentials.json") ?? "[]")),
    overrides: parseOverrides(JSON.parse(byName.get("overrides.json") ?? "{}")),
  });
}

async function buildOrchestratorClient(
  deps: ReconcileRunnerDeps,
  project: ProjectRow,
  tenant: TenantRow,
  tenantName: TenantName,
): Promise<OrchestratorClient> {
  if (
    tenant.oauthClientId === undefined ||
    tenant.oauthClientSecretEncrypted === undefined ||
    tenant.orchestratorUrl === undefined
  ) {
    throw new TenantNotConfiguredForOAuthError(project.name, tenantName);
  }
  const tokenManager = new TokenManager({
    tokenUrl: deps.identityTokenUrl(tenant),
    clientId: tenant.oauthClientId,
    encryptedClientSecret: tenant.oauthClientSecretEncrypted,
    scopes: tenant.oauthScopes ?? deps.oauthScopes ?? ["OR.Default"],
    encryptionKey: deps.encryptionKey,
    ...(deps.fetch !== undefined ? { fetch: deps.fetch } : {}),
  });
  const client = new OrchestratorClient({
    orchestratorUrl: tenant.orchestratorUrl,
    tokenManager,
    ...(deps.fetch !== undefined ? { fetch: deps.fetch } : {}),
    ...(tenant.folderId !== undefined ? { folderId: tenant.folderId } : {}),
  });
  await client.init();
  return client;
}

interface BuildAuditEntryArgs {
  readonly action: string;
  readonly context: ReconcileContext;
  readonly body: ReconcileRequestBody;
  readonly success: boolean;
  readonly after?: unknown;
  readonly error?: string;
}

function buildAuditEntry(args: BuildAuditEntryArgs): AuditEntry {
  return {
    action: args.action,
    actorUserId: args.context.actor.id,
    targetType: "project",
    targetId: args.body.projectName,
    success: args.success,
    correlationId: args.context.correlationId,
    transport: "n_a",
    tenant: args.body.tenant,
    ...(args.after !== undefined ? { after: args.after } : {}),
    ...(args.error !== undefined ? { error: args.error } : {}),
  };
}

function perOperationAuditEntry(
  applied: AppliedOperation,
  body: ReconcileRequestBody,
  context: ReconcileContext,
): AuditEntry {
  const op = applied.operation;
  const action = `reconcile.${op.resource}.${op.action}`;
  return {
    action,
    actorUserId: context.actor.id,
    targetType: op.resource,
    targetId: op.name,
    success: applied.success,
    correlationId: context.correlationId,
    transport: applied.transport,
    tenant: body.tenant,
    ...(applied.error !== undefined ? { error: applied.error.message } : {}),
  };
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
