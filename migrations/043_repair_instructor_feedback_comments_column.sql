ALTER TABLE public.instructor_feedback
  ADD COLUMN IF NOT EXISTS comments text;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'instructor_feedback'
      AND column_name = 'feedback'
  ) THEN
    EXECUTE 'UPDATE public.instructor_feedback SET comments = feedback::text WHERE comments IS NULL AND feedback IS NOT NULL';
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
