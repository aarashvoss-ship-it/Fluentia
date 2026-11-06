import { NextResponse } from "next/server";
import type { PoolClient } from "pg";
import { getPostgresPool, initializeDatabase, logDatabaseError } from "@/lib/db";
import { getServerSessionUser } from "@/lib/server/session";
import { isMembershipTier } from "@/types/membership";

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

export async function GET() {
  const access = await requireInstructor();
  if ("response" in access) return access.response;

  try {
    await initializeDatabase();
    const result = await getPostgresPool().query<{
      id: string;
      full_name: string;
      email: string;
      membership_tier: string;
      credit_balance: number;
      credit_limit: number;
      show_wallet_widget: boolean;
      is_scholarship: boolean;
    }>(
      `SELECT users.id::text, COALESCE(NULLIF(profiles.full_name, ''), users.email) AS full_name,
              users.email, profiles.membership_tier, profiles.credit_balance, profiles.credit_limit,
              profiles.show_wallet_widget,
              COALESCE(private_membership.is_scholarship, false) AS is_scholarship
       FROM public.profiles AS profiles
       JOIN public.users AS users ON users.id = profiles.id
       LEFT JOIN public.student_membership_private AS private_membership
         ON private_membership.student_id = profiles.id
       WHERE COALESCE(profiles.role, 'student') = 'student'
       ORDER BY COALESCE(NULLIF(profiles.full_name, ''), users.email)`,
    );
    return NextResponse.json({
      students: result.rows.map((student) => ({
        id: student.id,
        fullName: student.full_name,
        email: student.email,
        membershipTier: student.membership_tier,
        creditBalance: student.credit_balance,
        creditLimit: student.credit_limit,
        showWalletWidget: student.show_wallet_widget,
        isScholarship: student.is_scholarship,
      })),
    });
  } catch (error) {
    logDatabaseError("Student membership directory load failed:", error);
    return NextResponse.json({ error: "Unable to load student memberships." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const access = await requireInstructor();
  if ("response" in access) return access.response;

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Provide valid membership updates." }, { status: 400 });
  }

  const studentId = typeof body.studentId === "string" ? body.studentId.trim() : "";
  const membershipTier = body.membershipTier;
  const creditMode = body.creditMode;
  const creditAmount = body.creditAmount;
  const creditNote = typeof body.creditNote === "string" ? body.creditNote.trim() : "";
  const isScholarship = body.isScholarship;
  const showWalletWidget = body.showWalletWidget;
  if (!uuidPattern.test(studentId) || !isMembershipTier(membershipTier)
    || (creditMode !== "set" && creditMode !== "top_up")
    || typeof creditAmount !== "number" || !Number.isInteger(creditAmount)
    || creditAmount < (creditMode === "top_up" ? 1 : 0) || creditAmount > 100
    || creditNote.length > 500
    || typeof isScholarship !== "boolean" || typeof showWalletWidget !== "boolean") {
    return NextResponse.json({ error: "Provide a valid student, membership tier, credit amount, and wallet visibility setting." }, { status: 400 });
  }

  let client: PoolClient | undefined;
  try {
    client = await getPostgresPool().connect();
    await initializeDatabase();
    await client.query("BEGIN");
    const currentProfile = await client.query<{ credit_balance: number }>(
      `SELECT credit_balance
       FROM public.profiles
       WHERE id = $1::uuid AND COALESCE(role, 'student') = 'student'
       FOR UPDATE`,
      [studentId],
    );
    if (!currentProfile.rows[0]) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Student profile not found." }, { status: 404 });
    }

    if (currentProfile.rows[0].credit_balance > 0) {
      await client.query(
        `INSERT INTO public.student_credit_ledger
           (student_id, transaction_type, amount, balance_after, description, instructor_note)
         SELECT $1::uuid, 'credit', $2::integer, $2::integer, 'Opening balance', ''
         WHERE NOT EXISTS (
           SELECT 1 FROM public.student_credit_ledger WHERE student_id = $1::uuid
         )`,
        [studentId, currentProfile.rows[0].credit_balance],
      );
    }
    const result = await client.query<{
      membership_tier: string;
      credit_balance: number;
      credit_limit: number;
      show_wallet_widget: boolean;
    }>(
      `UPDATE public.profiles
       SET membership_tier = $2,
           credit_balance = CASE
             WHEN $3::text = 'set' THEN $4::integer
             ELSE LEAST(credit_limit, credit_balance + $4::integer)
           END,
           show_wallet_widget = $5::boolean,
           updated_at = now()
       WHERE id = $1::uuid AND COALESCE(role, 'student') = 'student'
       RETURNING membership_tier, credit_balance, credit_limit, show_wallet_widget`,
      [studentId, membershipTier, creditMode, creditAmount, showWalletWidget],
    );
    if (!result.rows[0]) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Student profile not found." }, { status: 404 });
    }
    const balanceDelta = result.rows[0].credit_balance - currentProfile.rows[0].credit_balance;
    if (balanceDelta !== 0) {
      await client.query(
        `INSERT INTO public.student_credit_ledger
           (student_id, transaction_type, amount, balance_after, description, instructor_note, created_by)
         VALUES ($1::uuid, $2, $3::integer, $4::integer, $5, $6, $7::uuid)`,
        [
          studentId,
          balanceDelta > 0 ? "credit" : "debit",
          Math.abs(balanceDelta),
          result.rows[0].credit_balance,
          creditMode === "top_up" ? "Instructor credit top-up" : "Instructor balance adjustment",
          creditNote,
          access.user.id,
        ],
      );
    }
    await client.query(
      `INSERT INTO public.student_membership_private (student_id, is_scholarship, updated_at)
       VALUES ($1::uuid, $2, now())
       ON CONFLICT (student_id) DO UPDATE
       SET is_scholarship = EXCLUDED.is_scholarship, updated_at = now()`,
      [studentId, isScholarship],
    );
    await client.query("COMMIT");
    return NextResponse.json({
      student: {
        id: studentId,
        membershipTier: result.rows[0].membership_tier,
        creditBalance: result.rows[0].credit_balance,
        creditLimit: result.rows[0].credit_limit,
        showWalletWidget: result.rows[0].show_wallet_widget,
        isScholarship,
      },
    });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => undefined);
    logDatabaseError("Student membership update failed:", error);
    return NextResponse.json({ error: "Unable to save membership and wallet updates." }, { status: 500 });
  } finally {
    client?.release();
  }
}
