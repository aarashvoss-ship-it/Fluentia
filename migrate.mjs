import fs from 'fs';
import pkg from 'pg';

const { Client } = pkg;

const envContent = fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf8') : '';
const match = envContent.match(/^\s*DATABASE_URL\s*=\s*(.+)\s*$/m);
const fileConnectionString = match?.[1].trim().replace(/^(['"])(.*)\1$/, '$2');
const connectionString = process.env.DATABASE_URL || fileConnectionString;

async function runMigration() {
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

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