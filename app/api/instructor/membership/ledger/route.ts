import { NextResponse } from "next/server";
import type { PoolClient } from "pg";
import { getPostgresPool, initializeDatabase, logDatabaseError } from "@/lib/db";
import { getServerSessionUser } from "@/lib/server/session";
import { getUtcDate, reconcileDailyCreditRule } from "@/lib/student-credit-ledger";

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
    const reconciled = await reconcileDailyCreditRule(client, studentId);
    if (!reconciled) {
      await rollback(client);
      return NextResponse.json({ error: "Student profile not found." }, { status: 404 });
    }

    const ledger = await client.query<{
      id: string;
      transaction_type: "credit" | "debit";
      amount: number;
      balance_after: number;
      description: string;
      instructor_note: string;
      created_at: Date;
    }>(
      `SELECT id, transaction_type, amount::float8 AS amount, balance_after::float8 AS balance_after,
              description, instructor_note, created_at
       FROM public.student_credit_ledger
       WHERE student_id = $1::uuid
       ORDER BY created_at DESC, id DESC`,
      [studentId],
    );
    const rules = await client.query<{
      daily_deduction_enabled: boolean;
      daily_deduction_rate: string;
    }>(
      `SELECT daily_deduction_enabled, daily_deduction_rate::text AS daily_deduction_rate
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
        dailyDeductionEnabled: rules.rows[0].daily_deduction_enabled,
        dailyDeductionRate: Number(rules.rows[0].daily_deduction_rate),
      },
      creditBalance: reconciled.balance,
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
    || typeof amount !== "number" || !Number.isFinite(amount)
    || Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-8 || amount < 0.01 || amount > 1000
    || description.length < 1 || description.length > 200 || instructorNote.length > 500) {
    return NextResponse.json({ error: "Provide a valid transaction type, amount, description, and instructor note." }, { status: 400 });
  }

  let client: PoolClient | undefined;
  try {
    await initializeDatabase();
    client = await getPostgresPool().connect();
    await client.query("BEGIN");
    const reconciled = await reconcileDailyCreditRule(client, studentId);
    if (!reconciled) {
      await rollback(client);
      return NextResponse.json({ error: "Student profile not found." }, { status: 404 });
    }

    const profile = await client.query<{ credit_balance: string; credit_limit: string }>(
      `SELECT credit_balance::text AS credit_balance, credit_limit::text AS credit_limit
       FROM public.profiles WHERE id = $1::uuid`,
      [studentId],
    );
    const currentBalance = Number(profile.rows[0].credit_balance);
    const creditLimit = Number(profile.rows[0].credit_limit);
    const nextBalance = Number((type === "credit" ? currentBalance + amount : currentBalance - amount).toFixed(2));
    if (nextBalance < 0 || nextBalance > creditLimit) {
      await rollback(client);
      return NextResponse.json({
        error: type === "credit" ? "This transaction exceeds the student's credit limit." : "This transaction exceeds the student's available balance.",
      }, { status: 400 });
    }

    await client.query(
      `UPDATE public.profiles SET credit_balance = $2::numeric, updated_at = now() WHERE id = $1::uuid`,
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
       VALUES ($1::uuid, $2, $3::numeric, $4::numeric, $5, $6, $7::uuid)
       RETURNING id, transaction_type, amount::float8 AS amount, balance_after::float8 AS balance_after, description, instructor_note, created_at`,
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
      creditBalance: Number(nextBalance.toFixed(2)),
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
  const dailyDeductionEnabled = body?.dailyDeductionEnabled;
  const dailyDeductionRate = body?.dailyDeductionRate;
  if (!uuidPattern.test(studentId) || typeof dailyDeductionEnabled !== "boolean"
    || typeof dailyDeductionRate !== "number" || !Number.isFinite(dailyDeductionRate)
    || Math.abs(dailyDeductionRate * 100 - Math.round(dailyDeductionRate * 100)) > 1e-8
    || dailyDeductionRate < 0.01 || dailyDeductionRate > 1000) {
    return NextResponse.json({ error: "Provide valid credit rule settings." }, { status: 400 });
  }

  let client: PoolClient | undefined;
  try {
    await initializeDatabase();
    client = await getPostgresPool().connect();
    await client.query("BEGIN");
    const reconciled = await reconcileDailyCreditRule(client, studentId);
    if (!reconciled) {
      await rollback(client);
      return NextResponse.json({ error: "Student profile not found." }, { status: 404 });
    }
    const today = await getUtcDate(client);
    await client.query(
      `INSERT INTO public.student_credit_rules
         (student_id, daily_deduction_enabled, daily_deduction_rate, daily_deduction_last_date, updated_at)
       SELECT id, $2::boolean, $3::numeric, $4::date, now()
       FROM public.profiles
       WHERE id = $1::uuid AND COALESCE(role, 'student') = 'student'
       ON CONFLICT (student_id) DO UPDATE
       SET daily_deduction_enabled = EXCLUDED.daily_deduction_enabled,
           daily_deduction_rate = EXCLUDED.daily_deduction_rate,
           daily_deduction_last_date = EXCLUDED.daily_deduction_last_date,
           updated_at = now()`,
      [studentId, dailyDeductionEnabled, dailyDeductionRate, today],
    );
    await client.query("COMMIT");
    return NextResponse.json({
      rules: {
        dailyDeductionEnabled,
        dailyDeductionRate,
      },
      creditBalance: reconciled.balance,
    });
  } catch (error) {
    if (client) await rollback(client);
    logDatabaseError("Student credit rule update failed:", error);
    return NextResponse.json({ error: "Unable to save student credit rules." }, { status: 500 });
  } finally {
    client?.release();
  }
}
