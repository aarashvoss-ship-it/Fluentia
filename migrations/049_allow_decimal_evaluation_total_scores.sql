ALTER TABLE public.instructor_feedback
  ALTER COLUMN total_score TYPE numeric USING total_score::numeric;
