import { eq } from "drizzle-orm";
import { type Database, users, type User } from "@rpa-platform/db";

// Local mirror of identity. Per the permissions architecture (memory:
// permissions_architecture), Orchestrator is the source of truth for role
// assignments — but our DB still keeps a `users` row per Slack user so
// audit_log + projects.owner_user_id have stable foreign keys.
export class UserRepo {
  readonly #db: Database;
  constructor(db: Database) {
    this.#db = db;
  }

  async getByEmail(email: string): Promise<User | undefined> {
    const rows = await this.#db.select().from(users).where(eq(users.email, email)).limit(1);
    return rows[0];
  }

  async upsertByEmail(input: {
    readonly email: string;
    readonly displayName: string;
    readonly slackUserId?: string;
    readonly githubLogin?: string;
  }): Promise<User> {
    const existing = await this.getByEmail(input.email);
    if (existing !== undefined) {
      return existing;
    }
    const inserted = await this.#db
      .insert(users)
      .values({
        email: input.email,
        displayName: input.displayName,
        ...(input.slackUserId !== undefined && { slackUserId: input.slackUserId }),
        ...(input.githubLogin !== undefined && { githubLogin: input.githubLogin }),
      })
      .returning();
    const row = inserted[0];
    if (row === undefined) {
      throw new Error(`Failed to insert user for email '${input.email}'.`);
    }
    return row;
  }
}
