import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import pkg from 'pg';
import { getPostgresConfig } from '@/lib/postgres-config.mjs';

const { Client } = pkg;

export async function GET() {
  let postgresConfig;
  try {
    postgresConfig = getPostgresConfig();
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }

  const client = new Client({
    ...postgresConfig,
  });

  try {
    await client.connect();
    const filePath = path.join(process.cwd(), 'schema.sql');
    const sql = fs.readFileSync(filePath, 'utf8');
    await client.query(sql);
    await client.end();
    
    return NextResponse.json({ success: true, message: 'Tables created successfully!' });
  } catch (error: any) {
    await client.end();
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}