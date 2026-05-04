import { eq } from "drizzle-orm";
import { type Database, type NewProject, type Project, projects } from "@rpa-platform/db";

export class ProjectRepo {
  readonly #db: Database;
  constructor(db: Database) {
    this.#db = db;
  }

  async getByName(name: string): Promise<Project | undefined> {
    const rows = await this.#db.select().from(projects).where(eq(projects.name, name)).limit(1);
    return rows[0];
  }

  async list(): Promise<readonly Project[]> {
    return this.#db.select().from(projects);
  }

  async create(input: NewProject): Promise<Project> {
    const inserted = await this.#db.insert(projects).values(input).returning();
    const row = inserted[0];
    if (row === undefined) {
      throw new Error(`Failed to insert project '${input.name}'.`);
    }
    return row;
  }
}
