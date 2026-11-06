import type { PoolClient } from "pg";

type DailyRule = {
  daily_deduction_enabled: boolean;
  daily_deduction_rate: string;
  last_processed_date: string | null;
};

function isValidDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`));
}

export async function getUtcDate(client: PoolClient) {
  const result = await client.query<{ today: string }>(
    "SELECT to_char((now() AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS today",
  );
  return result.rows[0].today;
}

export async function reconcileDailyCreditRule(client: PoolClient, studentId: string) {
  const today = await getUtcDate(client);
  const profile = await client.query<{ credit_balance: string }>(
    `SELECT credit_balance::text AS credit_balance
     FROM public.profiles
     WHERE id = $1::uuid AND COALESCE(role, 'student') = 'student'
     FOR UPDATE`,
    [studentId],
  );
  if (!profile.rows[0]) return null;

  await client.query(
    `INSERT INTO public.student_credit_rules (student_id, daily_deduction_last_date)
     VALUES ($1::uuid, $2::date)
     ON CONFLICT (student_id) DO NOTHING`,
    [studentId, today],
  );
  const ruleResult = await client.query<DailyRule>(
    `SELECT daily_deduction_enabled, daily_deduction_rate::text AS daily_deduction_rate,
            to_char(daily_deduction_last_date, 'YYYY-MM-DD') AS last_processed_date
     FROM public.student_credit_rules
     WHERE student_id = $1::uuid
     FOR UPDATE`,
    [studentId],
  );
  const rule = ruleResult.rows[0];
  if (!rule) throw new Error("Student credit rule was not initialized.");

  let balance = Number(profile.rows[0].credit_balance);
  if (balance > 0) {
    await client.query(
      `INSERT INTO public.student_credit_ledger
         (student_id, transaction_type, amount, balance_after, description, instructor_note, created_at)
       SELECT $1::uuid, 'credit', $2::numeric, $2::numeric, 'Opening balance', '',
              $3::date::timestamp AT TIME ZONE 'UTC'
       WHERE NOT EXISTS (
         SELECT 1 FROM public.student_credit_ledger WHERE student_id = $1::uuid
       )`,
      [studentId, balance, rule.last_processed_date || today],
    );
  }

  if (rule.daily_deduction_enabled) {
    let nextDate = rule.last_processed_date && isValidDate(rule.last_processed_date)
      ? new Date(`${rule.last_processed_date}T00:00:00.000Z`)
      : new Date(`${today}T00:00:00.000Z`);
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    const lastDate = new Date(`${today}T00:00:00.000Z`);

    while (nextDate <= lastDate && balance > 0) {
      const update = await client.query<{ credit_balance: string }>(
        `UPDATE public.profiles
         SET credit_balance = GREATEST(0, credit_balance - $2::numeric),
             updated_at = now()
         WHERE id = $1::uuid
         RETURNING credit_balance::text AS credit_balance`,
        [studentId, rule.daily_deduction_rate],
      );
      const nextBalance = Number(update.rows[0].credit_balance);
      const deducted = Number((balance - nextBalance).toFixed(2));
      if (deducted > 0) {
        const dateLabel = nextDate.toISOString().slice(0, 10);
        await client.query(
          `INSERT INTO public.student_credit_ledger
             (student_id, transaction_type, amount, balance_after, description, instructor_note, created_at)
           VALUES ($1::uuid, 'debit', $2::numeric, $3::numeric, $4, '', $5::date::timestamp AT TIME ZONE 'UTC')`,
          [
            studentId,
            deducted,
            nextBalance,
            `Daily subscription deduction · ${dateLabel}`,
            dateLabel,
          ],
        );
      }
      balance = nextBalance;
      nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    }
  }

  await client.query(
    `UPDATE public.student_credit_rules
     SET daily_deduction_last_date = $2::date
     WHERE student_id = $1::uuid`,
    [studentId, today],
  );
  return { balance, rule, today };
}
