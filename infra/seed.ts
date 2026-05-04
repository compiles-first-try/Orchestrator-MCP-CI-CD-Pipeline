// Seeds the local Postgres with a developer-friendly baseline:
//  - Three system roles (developer/admin/ba) with grants from
//    @rpa-platform/shared.
//  - Two framework releases (1.0.0 not json-ready, 2.0.0 json-ready).
//  - A demo project (`demo-bot`) wired to four tenants in
//    `pending_credentials` state.
//
// Run with `pnpm seed` (script lives in the workspace root once infra is
// active in docker-compose).
import { sql } from "drizzle-orm";
import { createDatabase, frameworkReleases, projects, projectTenants, roles } from "@rpa-platform/db";
import { ADMIN_PERMISSIONS, BA_PERMISSIONS, DEVELOPER_PERMISSIONS } from "@rpa-platform/shared";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://rpa:rpa@localhost:5432/rpa_platform";

async function main(): Promise<void> {
  const db = createDatabase(DATABASE_URL);

  await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL session_replication_role = 'replica'`);

    await tx
      .insert(roles)
      .values([
        { name: "developer", permissions: DEVELOPER_PERMISSIONS, isSystem: true },
        { name: "admin", permissions: ADMIN_PERMISSIONS, isSystem: true },
        { name: "ba", permissions: BA_PERMISSIONS, isSystem: true },
      ])
      .onConflictDoNothing();

    await tx
      .insert(frameworkReleases)
      .values([
        { version: "1.0.0", releaseNotes: "Pre-JSON era", jsonReady: false },
        { version: "2.0.0", releaseNotes: "First JSON-ready release", jsonReady: true },
      ])
      .onConflictDoNothing();

    const inserted = await tx
      .insert(projects)
      .values({ name: "demo-bot", repo: "compiles-first-try/demo-bot", frameworkVersion: "2.0.0" })
      .onConflictDoNothing()
      .returning();
    const projectId = inserted[0]?.id;
    if (projectId !== undefined) {
      await tx
        .insert(projectTenants)
        .values([
          { projectId, tenant: "dev", status: "pending_credentials" },
          { projectId, tenant: "test", status: "pending_credentials" },
          { projectId, tenant: "stage", status: "pending_credentials" },
          { projectId, tenant: "prod", status: "pending_credentials" },
        ])
        .onConflictDoNothing();
    }
  });

  console.log("Seed complete.");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
