ALTER TABLE public.academis_evaluation_insights
  DROP CONSTRAINT IF EXISTS academis_evaluation_insights_score_check;

ALTER TABLE public.academis_evaluation_insights
  ALTER COLUMN score TYPE numeric(5, 2)
  USING score::numeric(5, 2);

ALTER TABLE public.academis_evaluation_insights
  ADD CONSTRAINT academis_evaluation_insights_score_check
  CHECK (score IS NULL OR score BETWEEN 0 AND 100);
