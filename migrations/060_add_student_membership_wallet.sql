ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS membership_tier text NOT NULL DEFAULT 'Associate',
  ADD COLUMN IF NOT EXISTS credit_balance integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS credit_limit integer NOT NULL DEFAULT 100;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_membership_tier_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_membership_tier_check
      CHECK (membership_tier IN ('Fellowship', 'Associate', 'Mastery', 'Executive', 'Honorary Fellow', 'Honorary Guest'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_credit_balance_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_credit_balance_check
      CHECK (credit_balance >= 0 AND credit_balance <= credit_limit);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_credit_limit_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_credit_limit_check
      CHECK (credit_limit > 0);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.student_membership_private (
  student_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_scholarship boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.student_membership_private ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.student_membership_private FROM PUBLIC;
