import { Pool } from "pg";

export type AppDatabase = Pool;

export function getDatabaseUrl(): string {
  return (
    process.env.DATABASE_URL || "postgresql://surf:surf@localhost:5432/surf"
  );
}

export function connectDatabase(connectionString = getDatabaseUrl()): AppDatabase {
  return new Pool({
    connectionString,
  });
}

let appDatabase: AppDatabase | null = null;

export function getAppDatabase(): AppDatabase {
  if (!appDatabase) {
    appDatabase = connectDatabase();
  }

  return appDatabase;
}
