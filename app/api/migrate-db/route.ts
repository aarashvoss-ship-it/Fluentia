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
  });

  try {
    await client.connect();
    
    // خواندن فایل schema.sql از روت پروژه
    const filePath = path.join(process.cwd(), 'schema.sql');
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'schema.sql file not found in root directory' }, { status: 404 });
    }

    const sql = fs.readFileSync(filePath, 'utf8');

    // اجرای دستورات SQL روی دیتابیس پاستا
    await client.query(sql);

    await client.end();
    return NextResponse.json({ success: true, message: 'All tables created successfully on Paasta database!' });
  } catch (error: any) {
    await client.end();
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}