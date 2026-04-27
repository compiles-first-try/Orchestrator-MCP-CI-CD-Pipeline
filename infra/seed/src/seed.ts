import {
  createDatabase,
  frameworkReleases,
  projects,
  projectTenants,
  roles,
  userRoles,
  users,
  type Database,
} from "@rpa-platform/db";
import { SYSTEM_ROLES } from "@rpa-platform/shared";
import { eq } from "drizzle-orm";
import {
  SEED_FRAMEWORK_RELEASES,
  SEED_PROJECT,
  SEED_TENANTS,
  SEED_USERS,
  type SeedRole,
} from "./data.js";

export async function runSeed(db: Database): Promise<void> {
  await seedRoles(db);
  const userByLogin = await seedUsers(db);
  await seedFrameworkReleases(db);
  await seedProject(db, userByLogin);
}

async function seedRoles(db: Database): Promise<void> {
  const seedRolesData: readonly SeedRole[] = (["developer", "admin", "ba"] as const).map(
    (name) => ({
      name,
      isSystem: true,
      permissions: SYSTEM_ROLES[name],
    }),
  );
  for (const role of seedRolesData) {
    const existing = await db.select().from(roles).where(eq(roles.name, role.name)).limit(1);
    if (existing.length > 0) continue;
    await db.insert(roles).values({
      name: role.name,
      permissions: role.permissions,
      isSystem: role.isSystem,
    });
  }
}

async function seedUsers(db: Database): Promise<Map<string, string>> {
  const userByLogin = new Map<string, string>();
  for (const user of SEED_USERS) {
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, user.email))
      .limit(1);
    let userId = existing[0]?.id;
    if (userId === undefined) {
      const inserted = await db
        .insert(users)
        .values({
          slackUserId: user.slackUserId,
          githubLogin: user.githubLogin,
          email: user.email,
          displayName: user.displayName,
        })
        .returning({ id: users.id });
      userId = inserted[0]?.id;
    }
    if (userId === undefined) continue;
    userByLogin.set(user.githubLogin, userId);
    for (const roleName of user.roles) {
      const role = await db
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.name, roleName))
        .limit(1);
      const roleId = role[0]?.id;
      if (roleId === undefined) continue;
      await db.insert(userRoles).values({ userId, roleId }).onConflictDoNothing();
    }
  }
  return userByLogin;
}

async function seedFrameworkReleases(db: Database): Promise<void> {
  for (const release of SEED_FRAMEWORK_RELEASES) {
    const existing = await db
      .select()
      .from(frameworkReleases)
      .where(eq(frameworkReleases.version, release.version))
      .limit(1);
    if (existing.length > 0) continue;
    await db.insert(frameworkReleases).values({
      version: release.version,
      jsonReady: release.jsonReady,
      releaseNotes: release.releaseNotes,
    });
  }
}

async function seedProject(db: Database, userByLogin: Map<string, string>): Promise<void> {
  const ownerId = userByLogin.get("admin-user");
  if (ownerId === undefined) {
    throw new Error("seed: admin-user must exist before the project is seeded");
  }
  const existing = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.name, SEED_PROJECT.name))
    .limit(1);
  let projectId = existing[0]?.id;
  if (projectId === undefined) {
    const inserted = await db
      .insert(projects)
      .values({
        name: SEED_PROJECT.name,
        displayName: SEED_PROJECT.displayName,
        repoUrl: SEED_PROJECT.repoUrl,
        frameworkVersionPinned: SEED_PROJECT.frameworkVersionPinned,
        ownerUserId: ownerId,
      })
      .returning({ id: projects.id });
    projectId = inserted[0]?.id;
  }
  if (projectId === undefined) return;
  for (const tenant of SEED_TENANTS) {
    await db
      .insert(projectTenants)
      .values({
        projectId,
        tenantName: tenant.tenantName,
        status: tenant.status,
      })
      .onConflictDoNothing();
  }
}

async function main(): Promise<void> {
  const url = process.env["DATABASE_URL"];
  if (url === undefined) {
    process.stderr.write("DATABASE_URL is required for the seed.\n");
    process.exit(2);
  }
  const { db, close } = createDatabase({ connectionString: url });
  try {
    await runSeed(db);
    process.stdout.write("seed complete\n");
  } finally {
    await close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err: unknown) => {
    process.stderr.write(`seed failed: ${describe(err)}\n`);
    process.exit(1);
  });
}

function describe(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
