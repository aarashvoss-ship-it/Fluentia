ALTER TABLE public.instructor_feedback
  ADD COLUMN IF NOT EXISTS comments text,
  ADD COLUMN IF NOT EXISTS total_score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rubric_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS criterion_feedback jsonb NOT NULL DEFAULT '{}'::jsonb;

NOTIFY pgrst, 'reload schema';
