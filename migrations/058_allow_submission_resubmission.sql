ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS allow_resubmission boolean NOT NULL DEFAULT false;
