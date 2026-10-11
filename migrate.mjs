import fs from 'fs';
import pkg from 'pg';

const { Client } = pkg;

// خواندن مستقیم کانکشن استرینگ از فایل .env.local
const envContent = fs.readFileSync('.env.local', 'utf8');
const match = envContent.match(/DATABASE_URL=(.+)/);
const connectionString = match ? match[1].trim() : process.env.DATABASE_URL;

async function runMigration() {
  const client = new Client({
    connectionString,
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