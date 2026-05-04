import { and, eq } from "drizzle-orm";
import {
  type Database,
  type NewProjectTenant,
  type ProjectTenant,
  projectTenants,
} from "@rpa-platform/db";
import type { TenantName } from "@rpa-platform/shared";

export interface TenantConnectionUpdate {
  readonly oauthClientId: string;
  readonly oauthClientSecretEncrypted: string;
  readonly oauthScopes?: readonly string[];
  readonly folderId: string;
  readonly orchestratorUrl?: string;
  readonly status: ProjectTenant["status"];
}

export class ProjectTenantRepo {
  readonly #db: Database;
  constructor(db: Database) {
    this.#db = db;
  }

  async get(projectId: string, tenant: TenantName): Promise<ProjectTenant | undefined> {
    const rows = await this.#db
      .select()
      .from(projectTenants)
      .where(and(eq(projectTenants.projectId, projectId), eq(projectTenants.tenantName, tenant)))
      .limit(1);
    return rows[0];
  }

  async listForProject(projectId: string): Promise<readonly ProjectTenant[]> {
    return this.#db
      .select()
      .from(projectTenants)
      .where(eq(projectTenants.projectId, projectId));
  }

  async upsert(row: NewProjectTenant): Promise<void> {
    await this.#db
      .insert(projectTenants)
      .values(row)
      .onConflictDoUpdate({
        target: [projectTenants.projectId, projectTenants.tenantName],
        set: {
          ...(row.oauthClientId !== undefined && { oauthClientId: row.oauthClientId }),
          ...(row.oauthClientSecretEncrypted !== undefined && {
            oauthClientSecretEncrypted: row.oauthClientSecretEncrypted,
          }),
          ...(row.oauthScopes !== undefined && { oauthScopes: row.oauthScopes }),
          ...(row.folderId !== undefined && { folderId: row.folderId }),
          ...(row.orchestratorUrl !== undefined && { orchestratorUrl: row.orchestratorUrl }),
          ...(row.status !== undefined && { status: row.status }),
        },
      });
  }
}
