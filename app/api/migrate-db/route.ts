import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import pkg from 'pg';

const { Client } = pkg;

export async function GET() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    return NextResponse.json({ error: 'DATABASE_URL is not set' }, { status: 500 });
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
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