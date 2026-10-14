import { Pool } from "pg";
import { RUNTIME_SCHEMA_SQL } from "../lib/runtime-schema.mjs";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not configured.");
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
