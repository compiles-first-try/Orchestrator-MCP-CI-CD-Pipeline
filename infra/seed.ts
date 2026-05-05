// Seeds the local Postgres with a developer-friendly baseline:
//   • Three system roles (developer/admin/ba) with grants from
//     @rpa-platform/shared
//   • Two framework releases (1.0.0 not json-ready, 2.0.0 json-ready)
//
// Demo projects are NOT seeded — use `/rpa new <project>` from Slack to
// create one. That flow registers the project in the DB and creates the
// matching GitHub repo, which a hardcoded seed couldn't realistically do.
//
// Run with `pnpm seed`. Requires the docker-compose stack to be up so
// postgres is reachable on localhost (port from .env's DATABASE_URL).
import { createDatabase, frameworkReleases, roles } from "@rpa-platform/db";
import { ADMIN_PERMISSIONS, BA_PERMISSIONS, DEVELOPER_PERMISSIONS } from "@rpa-platform/shared";

const DATABASE_URL = process.env["DATABASE_URL"] ?? "postgres://rpa:rpa@localhost:5433/rpa_platform";

async function main(): Promise<void> {
  const { db, close } = createDatabase({ connectionString: DATABASE_URL });

  try {
    await db.transaction(async (tx) => {
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
    });

    console.log("Seed complete: 3 roles, 2 framework releases.");
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
