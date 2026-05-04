import { and, eq } from "drizzle-orm";
import { type Database, credentialValues } from "@rpa-platform/db";
import type { ManualSecretStore } from "@rpa-platform/credential-source";
import type { TenantName } from "@rpa-platform/shared";

// `secretRef` for the manual credential-source is encoded as
// `<projectId>/<tenant>/<credentialName>` so a single ManualSecretStore can
// serve every project + tenant + credential combination from the same
// `credential_values` table without a per-project store instance.
const REF_SEPARATOR = "/";

interface ParsedRef {
  readonly projectId: string;
  readonly tenant: TenantName;
  readonly credentialName: string;
}

function parseRef(secretRef: string): ParsedRef {
  const parts = secretRef.split(REF_SEPARATOR);
  if (parts.length !== 3) {
    throw new Error(
      `Invalid manual secretRef '${secretRef}'. Expected '<projectId>/<tenant>/<credentialName>'.`,
    );
  }
  const [projectId, tenant, credentialName] = parts;
  if (projectId === undefined || tenant === undefined || credentialName === undefined) {
    throw new Error(`Malformed manual secretRef '${secretRef}'.`);
  }
  if (tenant !== "dev" && tenant !== "test" && tenant !== "stage" && tenant !== "prod") {
    throw new Error(`Unknown tenant '${tenant}' in secretRef '${secretRef}'.`);
  }
  return { projectId, tenant, credentialName };
}

export class CredentialValuesRepo implements ManualSecretStore {
  readonly #db: Database;
  // The user that performed the most recent set; we record it on
  // credential_values.set_by_user_id. Caller can update via
  // `withActor()` on each request to bind the audit trail to the Slack user.
  readonly #defaultActorUserId: string;

  constructor(db: Database, defaultActorUserId: string) {
    this.#db = db;
    this.#defaultActorUserId = defaultActorUserId;
  }

  withActor(actorUserId: string): CredentialValuesRepo {
    return new CredentialValuesRepo(this.#db, actorUserId);
  }

  async read(secretRef: string): Promise<string | null> {
    const parsed = parseRef(secretRef);
    const rows = await this.#db
      .select()
      .from(credentialValues)
      .where(
        and(
          eq(credentialValues.projectId, parsed.projectId),
          eq(credentialValues.tenantName, parsed.tenant),
          eq(credentialValues.credentialName, parsed.credentialName),
        ),
      )
      .limit(1);
    return rows[0]?.valueEncrypted ?? null;
  }

  async write(secretRef: string, encrypted: string): Promise<void> {
    const parsed = parseRef(secretRef);
    await this.#db
      .insert(credentialValues)
      .values({
        projectId: parsed.projectId,
        tenantName: parsed.tenant,
        credentialName: parsed.credentialName,
        valueEncrypted: encrypted,
        setByUserId: this.#defaultActorUserId,
      })
      .onConflictDoUpdate({
        target: [
          credentialValues.projectId,
          credentialValues.tenantName,
          credentialValues.credentialName,
        ],
        set: { valueEncrypted: encrypted, setByUserId: this.#defaultActorUserId },
      });
  }

  async remove(secretRef: string): Promise<void> {
    const parsed = parseRef(secretRef);
    await this.#db
      .delete(credentialValues)
      .where(
        and(
          eq(credentialValues.projectId, parsed.projectId),
          eq(credentialValues.tenantName, parsed.tenant),
          eq(credentialValues.credentialName, parsed.credentialName),
        ),
      );
  }
}
