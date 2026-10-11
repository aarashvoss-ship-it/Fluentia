import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import pkg from 'pg';

const { Client } = pkg;

export async function GET() {
  // استفاده از پارامترهای صریح برای اتصال داخلی پاستا
  const client = new Client({
    host: process.env.PGHOST || 'database-280116ce-08a',
    port: Number(process.env.PGPORT) || 5432,
    database: process.env.PGDATABASE || 'paasta',
    user: process.env.PGUSER || 'paasta',
    password: process.env.PGPASSWORD || 'uYHJSWYQry9mFelZA2A8M29ksfpzgwPW',
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