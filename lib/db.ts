import { Pool } from "pg";

const globalForPostgres = globalThis as typeof globalThis & {
  fluentiaPostgresPool?: Pool;
};

export function getPostgresPool() {
  if (globalForPostgres.fluentiaPostgresPool) {
    return globalForPostgres.fluentiaPostgresPool;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured.");
  }

  const pool = new Pool({
    connectionString,
    ssl: true,
  });
  globalForPostgres.fluentiaPostgresPool = pool;
  return pool;
}
