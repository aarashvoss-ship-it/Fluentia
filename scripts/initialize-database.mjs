import { Pool } from "pg";
import nextEnv from "@next/env";
import { getPostgresConfig } from "../lib/postgres-config.mjs";
import { RUNTIME_SCHEMA_SQL } from "../lib/runtime-schema.mjs";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

if (process.env.NODE_ENV !== "production" && process.env.FLUENTIA_USE_LOCAL_SQLITE === "true") {
  const { initializeLocalSqlite } = await import("../lib/local-sqlite.mjs");
  await initializeLocalSqlite();
  console.info("Local SQLite database is ready.");
  process.exit(0);
}

let postgresConfig;
try {
  postgresConfig = getPostgresConfig();
} catch (error) {
  if (process.env.NODE_ENV === "production") {
    console.error("Fluentia database connection configuration is invalid:", error);
    process.exit(1);
  }
  console.warn("PostgreSQL is not configured for local development; initializing SQLite.");
  const { initializeLocalSqlite } = await import("../lib/local-sqlite.mjs");
  await initializeLocalSqlite();
  console.info("Local SQLite database is ready.");
  process.exit(0);
}

const pool = new Pool({
  ...postgresConfig,
  max: 10,
  connectionTimeoutMillis: 10_000,
});

let postgresAvailable = false;
try {
  await pool.query("SELECT 1");
  postgresAvailable = true;
} catch (error) {
  if (process.env.NODE_ENV === "production") {
    console.error("PostgreSQL is unavailable; refusing to start without the production database:", error);
    process.exitCode = 1;
  } else {
    console.warn("PostgreSQL is unavailable in local development; initializing SQLite.");
    const { initializeLocalSqlite } = await import("../lib/local-sqlite.mjs");
    await initializeLocalSqlite();
    console.info("Local SQLite database is ready.");
  }
}

if (postgresAvailable) {
  try {
    console.info("Initializing Fluentia database schema...");
    await pool.query(RUNTIME_SCHEMA_SQL);
    console.info("Fluentia database schema is ready (users, profiles, waitlist_requests).");
  } catch (error) {
    console.error("Fluentia database initialization failed:", error);
    process.exitCode = 1;
  }
}
await pool.end();
