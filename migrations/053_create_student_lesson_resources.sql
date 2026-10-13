CREATE TABLE IF NOT EXISTS public.student_lesson_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  student_token text NOT NULL,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  source_resource_id text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('lesson', 'custom')),
  resource jsonb NOT NULL CHECK (jsonb_typeof(resource) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_lesson_resources_student_identity_fkey
    FOREIGN KEY (student_id, student_token)
    REFERENCES public.students(id, token)
    ON DELETE CASCADE,
  CONSTRAINT student_lesson_resources_source_unique
    UNIQUE (student_id, lesson_id, source_resource_id)
);

CREATE INDEX IF NOT EXISTS idx_student_lesson_resources_student_lesson
  ON public.student_lesson_resources(student_id, lesson_id, created_at DESC);

ALTER TABLE public.student_lesson_resources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students can read their assigned lesson resources" ON public.student_lesson_resources;
CREATE POLICY "Students can read their assigned lesson resources"
  ON public.student_lesson_resources
  FOR SELECT
  TO authenticated
  USING (auth.uid() = student_id);

DROP POLICY IF EXISTS "Instructors can manage assigned lesson resources" ON public.student_lesson_resources;
CREATE POLICY "Instructors can manage assigned lesson resources"
  ON public.student_lesson_resources
  FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.instructors WHERE instructors.id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.instructors WHERE instructors.id = auth.uid()));

WITH assignment_targets AS (
  SELECT lesson_id, student_id
  FROM public.lesson_assignments
  WHERE status = 'assigned'

  UNION

  SELECT lessons.id AS lesson_id, students.id AS student_id
  FROM public.lessons AS lessons
  CROSS JOIN public.students AS students
  WHERE lessons.assigned_all_students IS TRUE
     OR lessons.content ->> 'assignedAllStudents' = 'true'
)
INSERT INTO public.student_lesson_resources (
  student_id,
  student_token,
  lesson_id,
  source_resource_id,
  source_type,
  resource
)
SELECT
  assignments.student_id,
  students.token,
  lessons.id,
  lesson_resource.resource ->> 'id',
  'lesson',
  jsonb_build_object(
    'id', lesson_resource.resource ->> 'id',
    'resource_type', CASE lower(COALESCE(lesson_resource.resource ->> 'type', ''))
      WHEN 'audio' THEN 'audio'
      WHEN 'video' THEN 'video'
      WHEN 'image' THEN 'image'
      WHEN 'pdf' THEN 'file'
      ELSE 'reading'
    END,
    'title', COALESCE(lesson_resource.resource ->> 'title', 'Lesson resource'),
    'body', lesson_resource.resource ->> 'description',
    'link_url', lesson_resource.resource ->> 'url',
    'resourceHubAssetId', lesson_resource.resource ->> 'resourceHubAssetId',
    'original_filename', CASE WHEN lower(COALESCE(lesson_resource.resource ->> 'type', '')) = 'pdf'
      THEN lesson_resource.resource ->> 'title' ELSE NULL END
  )
FROM assignment_targets AS assignments
JOIN public.students AS students ON students.id = assignments.student_id
JOIN public.lessons AS lessons ON lessons.id = assignments.lesson_id
CROSS JOIN LATERAL jsonb_array_elements(
  CASE
    WHEN jsonb_typeof(lessons.content -> 'lessonResources') = 'array'
      THEN lessons.content -> 'lessonResources'
    ELSE '[]'::jsonb
  END
) AS lesson_resource(resource)
WHERE lesson_resource.resource ->> 'id' IS NOT NULL
ON CONFLICT (student_id, lesson_id, source_resource_id) DO NOTHING;

DROP POLICY IF EXISTS "Students read assets assigned to their lessons" ON public.resource_assets;
CREATE POLICY "Students read assets assigned to their lessons"
  ON public.resource_assets
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.student_lesson_resources
      JOIN public.lessons ON lessons.id = student_lesson_resources.lesson_id
      WHERE student_lesson_resources.student_id = auth.uid()
        AND lessons.instructor_id = resource_assets.instructor_id
        AND lessons.status = 'published'
        AND student_lesson_resources.resource ->> 'resourceHubAssetId' = resource_assets.id::text
    )
  );

NOTIFY pgrst, 'reload schema';
