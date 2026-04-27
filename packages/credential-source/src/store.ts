import { credentialValues, type Database } from "@rpa-platform/db";
import type { TenantName } from "@rpa-platform/shared";
import { and, eq } from "drizzle-orm";

export interface CredentialStoreReadResult {
  readonly valueEncrypted: string;
}

export interface CredentialStoreWriteParams {
  readonly projectId: string;
  readonly tenant: TenantName;
  readonly name: string;
  readonly valueEncrypted: string;
  readonly setByUserId: string;
}

export interface CredentialStore {
  read(key: {
    projectId: string;
    tenant: TenantName;
    name: string;
  }): Promise<CredentialStoreReadResult | undefined>;
  upsert(params: CredentialStoreWriteParams): Promise<void>;
  list(scope: { projectId: string; tenant: TenantName }): Promise<readonly string[]>;
  remove(key: { projectId: string; tenant: TenantName; name: string }): Promise<void>;
}

export class DrizzleCredentialStore implements CredentialStore {
  constructor(private readonly db: Database) {}

  async read(key: {
    projectId: string;
    tenant: TenantName;
    name: string;
  }): Promise<CredentialStoreReadResult | undefined> {
    const rows = await this.db
      .select({ valueEncrypted: credentialValues.valueEncrypted })
      .from(credentialValues)
      .where(
        and(
          eq(credentialValues.projectId, key.projectId),
          eq(credentialValues.tenantName, key.tenant),
          eq(credentialValues.credentialName, key.name),
        ),
      )
      .limit(1);
    return rows[0];
  }

  async upsert(params: CredentialStoreWriteParams): Promise<void> {
    await this.db
      .insert(credentialValues)
      .values({
        projectId: params.projectId,
        tenantName: params.tenant,
        credentialName: params.name,
        valueEncrypted: params.valueEncrypted,
        setByUserId: params.setByUserId,
      })
      .onConflictDoUpdate({
        target: [
          credentialValues.projectId,
          credentialValues.tenantName,
          credentialValues.credentialName,
        ],
        set: {
          valueEncrypted: params.valueEncrypted,
          setByUserId: params.setByUserId,
          setAt: new Date(),
        },
      });
  }

  async list(scope: { projectId: string; tenant: TenantName }): Promise<readonly string[]> {
    const rows = await this.db
      .select({ credentialName: credentialValues.credentialName })
      .from(credentialValues)
      .where(
        and(
          eq(credentialValues.projectId, scope.projectId),
          eq(credentialValues.tenantName, scope.tenant),
        ),
      );
    return rows.map((r) => r.credentialName);
  }

  async remove(key: { projectId: string; tenant: TenantName; name: string }): Promise<void> {
    await this.db
      .delete(credentialValues)
      .where(
        and(
          eq(credentialValues.projectId, key.projectId),
          eq(credentialValues.tenantName, key.tenant),
          eq(credentialValues.credentialName, key.name),
        ),
      );
  }
}
