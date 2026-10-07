INSERT INTO public.resource_assets (
  instructor_id,
  title,
  main_category,
  sub_category,
  url,
  cefr_level,
  tags,
  allow_student_download
)
SELECT
  instructors.id,
  ambient_tracks.title,
  'audios',
  'Study Room Music',
  ambient_tracks.url,
  'All Levels',
  ARRAY['study-room', 'music']::text[],
  false
FROM public.ambient_tracks
CROSS JOIN public.instructors
WHERE ambient_tracks.is_active = true
  AND NOT EXISTS (
    SELECT 1
    FROM public.resource_assets
    WHERE resource_assets.instructor_id = instructors.id
      AND resource_assets.url = ambient_tracks.url
      AND resource_assets.main_category = 'audios'
      AND (
        resource_assets.sub_category = 'Study Room Music'
        OR resource_assets.tags @> ARRAY['study-room']::text[]
      )
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
        AND (
          (
            resource_assets.main_category = 'audios'
            AND (
              resource_assets.sub_category = 'Study Room Music'
              OR resource_assets.tags @> ARRAY['study-room']::text[]
            )
          )
          OR EXISTS (
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
    )
  );

NOTIFY pgrst, 'reload schema';
