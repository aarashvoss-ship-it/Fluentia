CREATE TABLE IF NOT EXISTS public.academis_evaluation_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  instructor_id uuid NOT NULL,
  stage_id text NOT NULL,
  task_id text,
  score numeric(3, 2) NOT NULL CHECK (score BETWEEN 1 AND 9),
  insights jsonb NOT NULL,
  model text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_academis_insights_student_created
  ON public.academis_evaluation_insights (student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_academis_insights_task_created
  ON public.academis_evaluation_insights (lesson_id, stage_id, task_id, created_at DESC);

ALTER TABLE public.academis_evaluation_insights
  ALTER COLUMN score TYPE numeric(3, 2) USING score::numeric;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'ALTER TABLE public.academis_evaluation_insights ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Instructors can read their Academis insights" ON public.academis_evaluation_insights';
    EXECUTE '
      CREATE POLICY "Instructors can read their Academis insights"
      ON public.academis_evaluation_insights
      FOR SELECT
      TO authenticated
      USING (
        auth.uid() = instructor_id
        AND EXISTS (
          SELECT 1
          FROM public.lessons
          WHERE lessons.id = academis_evaluation_insights.lesson_id
            AND lessons.instructor_id = auth.uid()
        )
      )';
  END IF;
END
$$;
