import fs from 'fs';
import pkg from 'pg';
import nextEnv from '@next/env';
import { getPostgresConfig } from './lib/postgres-config.mjs';

const { Client } = pkg;
const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

async function runMigration() {
  const client = new Client(getPostgresConfig());

  try {
    console.log('Connecting to Paasta database...');
    await client.connect();
    console.log('Connected successfully!');

    console.log('Reading schema.sql...');
    const sql = fs.readFileSync('schema.sql', 'utf8');

    console.log('Executing SQL schema on Paasta database...');
    await client.query(sql);
    console.log('Migration completed successfully! All tables created.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await client.end();
  }
}

runMigration();