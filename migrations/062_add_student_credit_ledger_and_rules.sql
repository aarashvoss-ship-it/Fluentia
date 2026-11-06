CREATE TABLE IF NOT EXISTS public.student_credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  transaction_type text NOT NULL CHECK (transaction_type IN ('credit', 'debit')),
  amount integer NOT NULL CHECK (amount > 0),
  balance_after integer NOT NULL CHECK (balance_after >= 0),
  description text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 1 AND 200),
  instructor_note text NOT NULL DEFAULT '' CHECK (char_length(instructor_note) <= 500),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS student_credit_ledger_student_created_idx
  ON public.student_credit_ledger (student_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.student_credit_rules (
  student_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  automation_mode text NOT NULL DEFAULT 'manual' CHECK (automation_mode IN ('manual', 'automated')),
  daily_deduction_enabled boolean NOT NULL DEFAULT false,
  daily_deduction_rate integer NOT NULL DEFAULT 2 CHECK (daily_deduction_rate IN (2, 3)),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.student_credit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_credit_rules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.student_credit_ledger FROM PUBLIC;
REVOKE ALL ON TABLE public.student_credit_rules FROM PUBLIC;
