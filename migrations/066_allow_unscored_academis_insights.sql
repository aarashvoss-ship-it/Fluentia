ALTER TABLE public.academis_evaluation_insights
  ALTER COLUMN score DROP NOT NULL;

ALTER TABLE public.academis_evaluation_insights
  DROP CONSTRAINT IF EXISTS academis_evaluation_insights_score_check;

ALTER TABLE public.academis_evaluation_insights
  ADD CONSTRAINT academis_evaluation_insights_score_check
  CHECK (score IS NULL OR score BETWEEN 1 AND 9);
