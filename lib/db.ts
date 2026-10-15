import { Pool } from "pg";
import { getPostgresConfig } from "./postgres-config.mjs";
import { RUNTIME_SCHEMA_SQL } from "./runtime-schema.mjs";

const globalForPostgres = globalThis as typeof globalThis & {
  fluentiaPostgresPool?: Pool;
  fluentiaPostgresInitialization?: Promise<void>;
};

export function getPostgresPool() {
  if (globalForPostgres.fluentiaPostgresPool) {
    return globalForPostgres.fluentiaPostgresPool;
  }

  const pool = new Pool({
    ...getPostgresConfig(),
    max: 10,
    connectionTimeoutMillis: 10_000,
  });
  globalForPostgres.fluentiaPostgresPool = pool;
  return pool;
}

export function logDatabaseError(context: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const code =
    error !== null
    && typeof error === "object"
    && "code" in error
    && typeof error.code === "string"
      ? error.code
      : undefined;

  console.error(context, { message, code });
}

export async function ensureTablesExist() {
  await getPostgresPool().query(RUNTIME_SCHEMA_SQL);
}

export async function initializeDatabase() {
  if (!globalForPostgres.fluentiaPostgresInitialization) {
    const pool = getPostgresPool();
    globalForPostgres.fluentiaPostgresInitialization = pool
      .query(RUNTIME_SCHEMA_SQL)
      .then(() => undefined);
  }

  const initialization = globalForPostgres.fluentiaPostgresInitialization;
  try {
    await initialization;
  } catch (error) {
    logDatabaseError("Database schema initialization failed:", error);
    if (globalForPostgres.fluentiaPostgresInitialization === initialization) {
      delete globalForPostgres.fluentiaPostgresInitialization;
    }
    throw error;
  }
}
