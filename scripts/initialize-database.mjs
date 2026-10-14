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

try {
  await pool.query(RUNTIME_SCHEMA_SQL);
  console.info("Fluentia native-auth and waitlist database schema is ready.");
} catch (error) {
  console.error("Fluentia database initialization failed:", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
