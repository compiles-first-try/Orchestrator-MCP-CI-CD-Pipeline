import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export type Database = PostgresJsDatabase<typeof schema>;

export interface CreateDatabaseOptions {
  readonly connectionString: string;
  readonly max?: number;
}

export function createDatabase(options: CreateDatabaseOptions): {
  db: Database;
  close: () => Promise<void>;
} {
  const client = postgres(options.connectionString, {
    max: options.max ?? 10,
  });
  const db = drizzle(client, { schema });
  return {
    db,
    close: async () => {
      await client.end({ timeout: 5 });
    },
  };
}
