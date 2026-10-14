import { Pool } from "pg";
import nextEnv from "@next/env";
import { RUNTIME_SCHEMA_SQL } from "../lib/runtime-schema.mjs";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!connectionString) {
  console.warn(
    "Skipping Fluentia database initialization: DATABASE_URL or POSTGRES_URL is not configured.",
  );
  process.exit(0);
}

const pool = new Pool({
  connectionString,
  ssl: true,
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
