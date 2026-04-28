import { and, eq } from "drizzle-orm";
import { projects, projectTenants, type Database } from "@rpa-platform/db";
import type { TenantName } from "@rpa-platform/shared";
import type { TenantStatus } from "@rpa-platform/reconciler";

export interface TenantRow {
  readonly status: TenantStatus;
  readonly orchestratorUrl: string | undefined;
  readonly mcpUrl: string | undefined;
  readonly folderId: string | undefined;
  readonly oauthClientId: string | undefined;
  readonly oauthClientSecretEncrypted: string | undefined;
  readonly oauthScopes: readonly string[] | undefined;
}

export interface ProjectRow {
  readonly id: string;
  readonly name: string;
  readonly repoUrl: string;
  readonly frameworkVersionPinned: string;
  readonly tenants: ReadonlyMap<TenantName, TenantRow>;
}

export interface ProjectLookup {
  byName(name: string): Promise<ProjectRow | undefined>;
}

export class DrizzleProjectLookup implements ProjectLookup {
  constructor(private readonly db: Database) {}

  async byName(name: string): Promise<ProjectRow | undefined> {
    const projectRows = await this.db
      .select({
        id: projects.id,
        name: projects.name,
        repoUrl: projects.repoUrl,
        frameworkVersionPinned: projects.frameworkVersionPinned,
      })
      .from(projects)
      .where(eq(projects.name, name))
      .limit(1);
    const project = projectRows[0];
    if (project === undefined) return undefined;
    const tenantRows = await this.db
      .select()
      .from(projectTenants)
      .where(eq(projectTenants.projectId, project.id));
    const tenants = new Map<TenantName, TenantRow>();
    for (const row of tenantRows) {
      tenants.set(row.tenantName, {
        status: row.status as TenantStatus,
        orchestratorUrl: row.orchestratorUrl ?? undefined,
        mcpUrl: row.mcpUrl ?? undefined,
        folderId: row.folderId ?? undefined,
        oauthClientId: row.oauthClientId ?? undefined,
        oauthClientSecretEncrypted: row.oauthClientSecretEncrypted ?? undefined,
        oauthScopes: row.oauthScopes ?? undefined,
      });
    }
    return {
      id: project.id,
      name: project.name,
      repoUrl: project.repoUrl,
      frameworkVersionPinned: project.frameworkVersionPinned,
      tenants,
    };
  }
}

export function parseRepoUrl(repoUrl: string): { owner: string; repo: string } {
  // Accepts https://github.com/{owner}/{repo}, https://github.com/{owner}/{repo}.git,
  // https://github.test/{owner}/{repo} (test domain), and bare {owner}/{repo} forms.
  const trimmed = repoUrl.replace(/\.git$/, "");
  const url = trimmed.includes("://") ? new URL(trimmed) : new URL(`https://x/${trimmed}`);
  const segments = url.pathname.split("/").filter((p) => p.length > 0);
  const owner = segments[0];
  const repo = segments[1];
  if (owner === undefined || repo === undefined) {
    throw new Error(`could not parse owner/repo from '${repoUrl}'`);
  }
  return { owner, repo };
}
