import { NextResponse } from "next/server";
import type { PoolClient } from "pg";
import { getPostgresPool, initializeDatabase, logDatabaseError } from "@/lib/db";
import { getServerSessionUser } from "@/lib/server/session";

export const runtime = "nodejs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function requireInstructor() {
  const user = await getServerSessionUser();
  if (!user) return { response: NextResponse.json({ error: "Sign in to manage memberships." }, { status: 401 }) };
  if (user.role !== "instructor" && user.role !== "admin") {
    return { response: NextResponse.json({ error: "Only instructors can manage memberships." }, { status: 403 }) };
  }
  return { user };
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

async function rollback(client: PoolClient) {
  try {
    await client.query("ROLLBACK");
  } catch (error) {
    logDatabaseError("Student credit ledger transaction rollback failed:", error);
  }
}

export async function GET(request: Request) {
  const access = await requireInstructor();
  if ("response" in access) return access.response;

  const studentId = new URL(request.url).searchParams.get("studentId")?.trim() || "";
  if (!uuidPattern.test(studentId)) {
    return NextResponse.json({ error: "Provide a valid student account." }, { status: 400 });
  }

  let client: PoolClient | undefined;
  try {
    await initializeDatabase();
    client = await getPostgresPool().connect();
    await client.query("BEGIN");
    const profile = await client.query<{ credit_balance: number }>(
      `SELECT credit_balance
       FROM public.profiles
       WHERE id = $1::uuid AND COALESCE(role, 'student') = 'student'
       FOR UPDATE`,
      [studentId],
    );
    if (!profile.rows[0]) {
      await rollback(client);
      return NextResponse.json({ error: "Student profile not found." }, { status: 404 });
    }

    if (profile.rows[0].credit_balance > 0) {
      await client.query(
        `INSERT INTO public.student_credit_ledger
           (student_id, transaction_type, amount, balance_after, description, instructor_note)
         SELECT $1::uuid, 'credit', $2::integer, $2::integer, 'Opening balance', ''
         WHERE NOT EXISTS (
           SELECT 1 FROM public.student_credit_ledger WHERE student_id = $1::uuid
         )`,
        [studentId, profile.rows[0].credit_balance],
      );
    }
    await client.query(
      `INSERT INTO public.student_credit_rules (student_id)
       VALUES ($1::uuid)
       ON CONFLICT (student_id) DO NOTHING`,
      [studentId],
    );

    const ledger = await client.query<{
      id: string;
      transaction_type: "credit" | "debit";
      amount: number;
      balance_after: number;
      description: string;
      instructor_note: string;
      created_at: Date;
    }>(
      `SELECT id, transaction_type, amount, balance_after, description, instructor_note, created_at
       FROM public.student_credit_ledger
       WHERE student_id = $1::uuid
       ORDER BY created_at DESC, id DESC`,
      [studentId],
    );
    const rules = await client.query<{
      automation_mode: "manual" | "automated";
      daily_deduction_enabled: boolean;
      daily_deduction_rate: number;
    }>(
      `SELECT automation_mode, daily_deduction_enabled, daily_deduction_rate
       FROM public.student_credit_rules
       WHERE student_id = $1::uuid`,
      [studentId],
    );

    await client.query("COMMIT");
    return NextResponse.json({
      transactions: ledger.rows.map((row) => ({
        id: row.id,
        type: row.transaction_type,
        amount: row.amount,
        balanceAfter: row.balance_after,
        description: row.description,
        instructorNote: row.instructor_note,
        createdAt: row.created_at,
      })),
      rules: {
        automationMode: rules.rows[0].automation_mode,
        dailyDeductionEnabled: rules.rows[0].daily_deduction_enabled,
        dailyDeductionRate: rules.rows[0].daily_deduction_rate,
      },
    });
  } catch (error) {
    if (client) await rollback(client);
    logDatabaseError("Student credit ledger load failed:", error);
    return NextResponse.json({ error: "Unable to load the student credit ledger." }, { status: 500 });
  } finally {
    client?.release();
  }
}

export async function POST(request: Request) {
  const access = await requireInstructor();
  if ("response" in access) return access.response;
  const body = await readJson(request);
  const studentId = typeof body?.studentId === "string" ? body.studentId.trim() : "";
  const type = body?.type;
  const amount = body?.amount;
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  const instructorNote = typeof body?.instructorNote === "string" ? body.instructorNote.trim() : "";
  if (!uuidPattern.test(studentId) || (type !== "credit" && type !== "debit")
    || typeof amount !== "number" || !Number.isInteger(amount) || amount < 1 || amount > 1000
    || description.length < 1 || description.length > 200 || instructorNote.length > 500) {
    return NextResponse.json({ error: "Provide a valid transaction type, amount, description, and instructor note." }, { status: 400 });
  }

  let client: PoolClient | undefined;
  try {
    await initializeDatabase();
    client = await getPostgresPool().connect();
    await client.query("BEGIN");
    const profile = await client.query<{ credit_balance: number; credit_limit: number }>(
      `SELECT credit_balance, credit_limit
       FROM public.profiles
       WHERE id = $1::uuid AND COALESCE(role, 'student') = 'student'
       FOR UPDATE`,
      [studentId],
    );
    if (!profile.rows[0]) {
      await rollback(client);
      return NextResponse.json({ error: "Student profile not found." }, { status: 404 });
    }

    const currentBalance = profile.rows[0].credit_balance;
    if (currentBalance > 0) {
      await client.query(
        `INSERT INTO public.student_credit_ledger
           (student_id, transaction_type, amount, balance_after, description, instructor_note)
         SELECT $1::uuid, 'credit', $2::integer, $2::integer, 'Opening balance', ''
         WHERE NOT EXISTS (
           SELECT 1 FROM public.student_credit_ledger WHERE student_id = $1::uuid
         )`,
        [studentId, currentBalance],
      );
    }
    const nextBalance = type === "credit" ? currentBalance + amount : currentBalance - amount;
    if (nextBalance < 0 || nextBalance > profile.rows[0].credit_limit) {
      await rollback(client);
      return NextResponse.json({
        error: type === "credit" ? "This transaction exceeds the student's credit limit." : "This transaction exceeds the student's available balance.",
      }, { status: 400 });
    }

    await client.query(
      `UPDATE public.profiles SET credit_balance = $2::integer, updated_at = now() WHERE id = $1::uuid`,
      [studentId, nextBalance],
    );
    const result = await client.query<{
      id: string;
      transaction_type: "credit" | "debit";
      amount: number;
      balance_after: number;
      description: string;
      instructor_note: string;
      created_at: Date;
    }>(
      `INSERT INTO public.student_credit_ledger
         (student_id, transaction_type, amount, balance_after, description, instructor_note, created_by)
       VALUES ($1::uuid, $2, $3::integer, $4::integer, $5, $6, $7::uuid)
       RETURNING id, transaction_type, amount, balance_after, description, instructor_note, created_at`,
      [studentId, type, amount, nextBalance, description, instructorNote, access.user.id],
    );
    await client.query("COMMIT");
    const transaction = result.rows[0];
    return NextResponse.json({
      transaction: {
        id: transaction.id,
        type: transaction.transaction_type,
        amount: transaction.amount,
        balanceAfter: transaction.balance_after,
        description: transaction.description,
        instructorNote: transaction.instructor_note,
        createdAt: transaction.created_at,
      },
      creditBalance: nextBalance,
    });
  } catch (error) {
    if (client) await rollback(client);
    logDatabaseError("Student credit transaction save failed:", error);
    return NextResponse.json({ error: "Unable to save the student credit transaction." }, { status: 500 });
  } finally {
    client?.release();
  }
}

export async function PUT(request: Request) {
  const access = await requireInstructor();
  if ("response" in access) return access.response;
  const body = await readJson(request);
  const studentId = typeof body?.studentId === "string" ? body.studentId.trim() : "";
  const automationMode = body?.automationMode;
  const dailyDeductionEnabled = body?.dailyDeductionEnabled;
  const dailyDeductionRate = body?.dailyDeductionRate;
  if (!uuidPattern.test(studentId) || (automationMode !== "manual" && automationMode !== "automated")
    || typeof dailyDeductionEnabled !== "boolean"
    || (dailyDeductionRate !== 2 && dailyDeductionRate !== 3)) {
    return NextResponse.json({ error: "Provide valid credit rule settings." }, { status: 400 });
  }

  try {
    await initializeDatabase();
    const result = await getPostgresPool().query<{
      automation_mode: "manual" | "automated";
      daily_deduction_enabled: boolean;
      daily_deduction_rate: number;
    }>(
      `INSERT INTO public.student_credit_rules
         (student_id, automation_mode, daily_deduction_enabled, daily_deduction_rate, updated_at)
       SELECT id, $2, $3::boolean, $4::integer, now()
       FROM public.profiles
       WHERE id = $1::uuid AND COALESCE(role, 'student') = 'student'
       ON CONFLICT (student_id) DO UPDATE
       SET automation_mode = EXCLUDED.automation_mode,
           daily_deduction_enabled = EXCLUDED.daily_deduction_enabled,
           daily_deduction_rate = EXCLUDED.daily_deduction_rate,
           updated_at = now()
       RETURNING automation_mode, daily_deduction_enabled, daily_deduction_rate`,
      [studentId, automationMode, dailyDeductionEnabled, dailyDeductionRate],
    );
    if (!result.rows[0]) {
      return NextResponse.json({ error: "Student profile not found." }, { status: 404 });
    }
    return NextResponse.json({
      rules: {
        automationMode: result.rows[0].automation_mode,
        dailyDeductionEnabled: result.rows[0].daily_deduction_enabled,
        dailyDeductionRate: result.rows[0].daily_deduction_rate,
      },
    });
  } catch (error) {
    logDatabaseError("Student credit rule update failed:", error);
    return NextResponse.json({ error: "Unable to save student credit rules." }, { status: 500 });
  }
}
