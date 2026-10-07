CREATE TABLE IF NOT EXISTS public.resource_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  instructor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  main_category text NOT NULL CHECK (main_category IN ('documents', 'videos', 'audios', 'visuals', 'others')),
  sub_category text NOT NULL,
  url text NOT NULL,
  cefr_level text NOT NULL CHECK (cefr_level IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'All Levels')),
  tags text[] NOT NULL DEFAULT '{}',
  allow_student_download boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_resource_assets_instructor_id
  ON public.resource_assets(instructor_id);

ALTER TABLE public.resource_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Instructors manage their own resource assets" ON public.resource_assets;
CREATE POLICY "Instructors manage their own resource assets"
  ON public.resource_assets
  FOR ALL
  TO authenticated
  USING (
    instructor_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.instructors WHERE instructors.id = auth.uid())
  )
  WITH CHECK (
    instructor_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.instructors WHERE instructors.id = auth.uid())
  );

DROP POLICY IF EXISTS "Students read assets assigned to their lessons" ON public.resource_assets;
CREATE POLICY "Students read assets assigned to their lessons"
  ON public.resource_assets
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.lessons
      JOIN public.lesson_assignments
        ON lesson_assignments.lesson_id = lessons.id
      WHERE lessons.instructor_id = resource_assets.instructor_id
        AND lessons.status = 'published'
        AND lesson_assignments.student_id = auth.uid()
        AND lesson_assignments.status = 'assigned'
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(
            CASE
              WHEN jsonb_typeof(lessons.content -> 'lessonResources') = 'array'
                THEN lessons.content -> 'lessonResources'
              ELSE '[]'::jsonb
            END
          ) AS lesson_resources(resource)
          WHERE lesson_resources.resource ->> 'resourceHubAssetId' = resource_assets.id::text
        )
    )
  );

CREATE OR REPLACE FUNCTION public.set_resource_assets_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_resource_assets_updated_at ON public.resource_assets;
CREATE TRIGGER set_resource_assets_updated_at
  BEFORE UPDATE ON public.resource_assets
  FOR EACH ROW
  EXECUTE FUNCTION public.set_resource_assets_updated_at();
