ALTER TABLE public.profiles
  ALTER COLUMN credit_balance TYPE numeric(10, 2) USING credit_balance::numeric(10, 2);

ALTER TABLE public.student_credit_ledger
  ALTER COLUMN amount TYPE numeric(10, 2) USING amount::numeric(10, 2),
  ALTER COLUMN balance_after TYPE numeric(10, 2) USING balance_after::numeric(10, 2);

ALTER TABLE public.student_credit_rules
  ADD COLUMN IF NOT EXISTS daily_deduction_last_date date NOT NULL DEFAULT CURRENT_DATE;

ALTER TABLE public.student_credit_rules
  DROP CONSTRAINT IF EXISTS student_credit_rules_daily_deduction_rate_check;

ALTER TABLE public.student_credit_rules
  ALTER COLUMN daily_deduction_rate TYPE numeric(8, 2) USING daily_deduction_rate::numeric(8, 2),
  ALTER COLUMN daily_deduction_rate SET DEFAULT 3;

ALTER TABLE public.student_credit_rules
  ADD CONSTRAINT student_credit_rules_daily_deduction_rate_check
  CHECK (daily_deduction_rate > 0 AND daily_deduction_rate <= 1000);

UPDATE public.student_credit_rules
SET daily_deduction_last_date = (now() AT TIME ZONE 'UTC')::date
WHERE daily_deduction_last_date IS NULL;
