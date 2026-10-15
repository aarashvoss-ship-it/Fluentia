import { Pool } from "pg";
import nextEnv from "@next/env";
import { getPostgresConfig } from "../lib/postgres-config.mjs";
import { RUNTIME_SCHEMA_SQL } from "../lib/runtime-schema.mjs";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

let postgresConfig;
try {
  postgresConfig = getPostgresConfig();
} catch (error) {
  if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL
    && !process.env.DATABASE_HOST && !process.env.POSTGRES_HOST && !process.env.PGHOST) {
    console.warn(
      "Skipping Fluentia database initialization: no PostgreSQL connection settings are configured.",
    );
    process.exit(0);
  }
  console.error("Fluentia database connection configuration is invalid:", error);
  process.exit(1);
}

const pool = new Pool({
  ...postgresConfig,
  max: 10,
  connectionTimeoutMillis: 10_000,
});

function isDnsResolutionError(error) {
  return (
    error !== null
    && typeof error === "object"
    && "code" in error
    && (error.code === "ENOTFOUND" || error.code === "EAI_AGAIN")
  );
}

try {
  console.info("Initializing Fluentia database schema...");
  await pool.query(RUNTIME_SCHEMA_SQL);
  console.info("Fluentia database schema is ready (users, profiles, waitlist_requests).");
} catch (error) {
  if (isDnsResolutionError(error)) {
    console.warn("Database unreachable in local mode, skipping init");
    process.exit(0);
  }

  console.error("Fluentia database initialization failed:", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
