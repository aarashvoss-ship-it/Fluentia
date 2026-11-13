CREATE TABLE IF NOT EXISTS public.student_task_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id text NOT NULL,
  module_id text NOT NULL,
  stage_id text NOT NULL,
  task_id text NOT NULL,
  report_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_content jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS student_task_reports_hierarchy_idx
  ON public.student_task_reports
    (student_id, module_id, stage_id, task_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS student_task_reports_published_hierarchy_idx
  ON public.student_task_reports
    (student_id, module_id, stage_id, task_id)
  WHERE is_published = true;

CREATE OR REPLACE FUNCTION public.set_student_task_reports_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_student_task_reports_updated_at
  ON public.student_task_reports;
CREATE TRIGGER set_student_task_reports_updated_at
  BEFORE UPDATE ON public.student_task_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.set_student_task_reports_updated_at();
