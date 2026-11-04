BEGIN;

ALTER TABLE public.resource_assets
  ADD COLUMN IF NOT EXISTS resource_type text NOT NULL DEFAULT 'link',
  ADD COLUMN IF NOT EXISTS content jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS original_filename text,
  ADD COLUMN IF NOT EXISTS media_type text,
  ADD COLUMN IF NOT EXISTS storage_path text;

CREATE UNIQUE INDEX IF NOT EXISTS resource_assets_id_instructor_key
  ON public.resource_assets(id, instructor_id);

CREATE TABLE IF NOT EXISTS public.lesson_resource_links (
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  instructor_id uuid NOT NULL,
  lesson_resource_id text NOT NULL,
  resource_asset_id uuid NOT NULL,
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lesson_id, lesson_resource_id),
  FOREIGN KEY (resource_asset_id, instructor_id)
    REFERENCES public.resource_assets(id, instructor_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS lesson_resource_links_asset_idx
  ON public.lesson_resource_links(resource_asset_id);

CREATE INDEX IF NOT EXISTS lesson_resource_links_lesson_order_idx
  ON public.lesson_resource_links(lesson_id, position);

ALTER TABLE public.lesson_resource_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Instructors manage their lesson resource links" ON public.lesson_resource_links;
CREATE POLICY "Instructors manage their lesson resource links"
  ON public.lesson_resource_links
  FOR ALL
  TO authenticated
  USING (
    instructor_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.instructors WHERE instructors.id = auth.uid()
    )
  )
  WITH CHECK (
    instructor_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.instructors WHERE instructors.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Students read assigned lesson resource links" ON public.lesson_resource_links;
CREATE POLICY "Students read assigned lesson resource links"
  ON public.lesson_resource_links
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.lessons
      WHERE lessons.id = lesson_resource_links.lesson_id
        AND lessons.instructor_id = lesson_resource_links.instructor_id
        AND (lessons.status = 'published' OR lessons.is_published IS TRUE)
        AND (
          lessons.student_id = auth.uid()
          OR lessons.assigned_all_students IS TRUE
          OR EXISTS (
            SELECT 1 FROM public.lesson_assignments
            WHERE lesson_assignments.lesson_id = lessons.id
              AND lesson_assignments.student_id = auth.uid()
              AND lesson_assignments.status = 'assigned'
          )
        )
    )
  );

WITH latest_versions AS (
  SELECT DISTINCT ON (lesson_id) lesson_id, content
  FROM public.lesson_versions
  ORDER BY lesson_id, version_number DESC, created_at DESC
),
legacy_resources AS (
  SELECT DISTINCT ON (lesson.id, resource.resource ->> 'id')
    lesson.id AS lesson_id,
    lesson.instructor_id,
    resource.resource ->> 'id' AS lesson_resource_id,
    (resource.ordinality - 1)::integer AS position,
    resource.resource AS data
  FROM public.lessons AS lesson
  JOIN latest_versions AS version ON version.lesson_id = lesson.id
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(version.content -> 'lessonResources') = 'array'
        THEN version.content -> 'lessonResources'
      ELSE '[]'::jsonb
    END
  ) WITH ORDINALITY AS resource(resource, ordinality)
  WHERE lesson.instructor_id IS NOT NULL
    AND resource.resource ->> 'id' IS NOT NULL
  ORDER BY lesson.id, resource.resource ->> 'id', resource.ordinality DESC
),
canonical_resources AS (
  SELECT
    legacy.*,
    CASE
      WHEN legacy.data ->> 'resourceHubAssetId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       AND EXISTS (
         SELECT 1 FROM public.resource_assets AS existing
         WHERE existing.id = (legacy.data ->> 'resourceHubAssetId')::uuid
           AND existing.instructor_id = legacy.instructor_id
       )
        THEN (legacy.data ->> 'resourceHubAssetId')::uuid
      ELSE md5(legacy.lesson_id::text || ':' || legacy.lesson_resource_id)::uuid
    END AS asset_id
  FROM legacy_resources AS legacy
)
INSERT INTO public.resource_assets (
  id, instructor_id, title, description, main_category, sub_category, url,
  allow_student_download, cefr_level, tags, resource_type, content,
  original_filename, media_type, storage_path
)
SELECT
  resource.asset_id,
  resource.instructor_id,
  COALESCE(NULLIF(resource.data ->> 'title', ''), 'Lesson resource'),
  NULLIF(resource.data ->> 'description', ''),
  CASE
    WHEN COALESCE(resource.data ->> 'resourceType', '') IN ('audio') OR lower(COALESCE(resource.data ->> 'type', '')) = 'audio' THEN 'audios'
    WHEN COALESCE(resource.data ->> 'resourceType', '') IN ('video') OR lower(COALESCE(resource.data ->> 'type', '')) = 'video' THEN 'videos'
    WHEN COALESCE(resource.data ->> 'resourceType', '') IN ('image', 'flashcard', 'flashcards') OR lower(COALESCE(resource.data ->> 'type', '')) = 'image' THEN 'visuals'
    WHEN COALESCE(resource.data ->> 'resourceType', '') IN ('note', 'reading', 'quiz', 'file', 'data_table') OR lower(COALESCE(resource.data ->> 'type', '')) = 'pdf' THEN 'documents'
    ELSE 'others'
  END,
  COALESCE(NULLIF(resource.data ->> 'subCategory', ''), CASE
    WHEN COALESCE(resource.data ->> 'resourceType', '') IN ('flashcard', 'flashcards') THEN 'Flashcards'
    WHEN COALESCE(resource.data ->> 'resourceType', '') = 'audio' THEN 'Podcasts'
    WHEN COALESCE(resource.data ->> 'resourceType', '') = 'video' THEN 'Other Videos'
    WHEN COALESCE(resource.data ->> 'resourceType', '') = 'image' THEN 'Images'
    WHEN COALESCE(resource.data ->> 'resourceType', '') = 'file' OR lower(COALESCE(resource.data ->> 'type', '')) = 'pdf' THEN 'PDFs'
    WHEN COALESCE(resource.data ->> 'resourceType', '') IN ('note', 'reading', 'quiz', 'data_table') THEN 'Texts'
    ELSE 'General'
  END),
  COALESCE(resource.data ->> 'url', ''),
  CASE WHEN resource.data ->> 'isDownloadable' IN ('true', 'false')
    THEN (resource.data ->> 'isDownloadable')::boolean ELSE true END,
  CASE WHEN resource.data ->> 'cefrLevel' IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'All Levels')
    THEN resource.data ->> 'cefrLevel' ELSE 'All Levels' END,
  CASE WHEN jsonb_typeof(resource.data -> 'tags') = 'array'
    THEN ARRAY(SELECT jsonb_array_elements_text(resource.data -> 'tags')) ELSE '{}'::text[] END,
  CASE WHEN resource.data ->> 'resourceType' IN ('note', 'reading', 'flashcard', 'flashcards', 'quiz', 'audio', 'data_table', 'file', 'image', 'video', 'links')
    THEN resource.data ->> 'resourceType'
    WHEN lower(COALESCE(resource.data ->> 'type', '')) = 'audio' THEN 'audio'
    WHEN lower(COALESCE(resource.data ->> 'type', '')) = 'video' THEN 'video'
    WHEN lower(COALESCE(resource.data ->> 'type', '')) = 'image' THEN 'image'
    WHEN lower(COALESCE(resource.data ->> 'type', '')) = 'pdf' THEN 'file'
    ELSE 'reading' END,
  jsonb_strip_nulls(jsonb_build_object(
    'body', resource.data -> 'body',
    'question', resource.data -> 'question',
    'answer', resource.data -> 'answer',
    'explanation', resource.data -> 'explanation',
    'subtitle', resource.data -> 'subtitle',
    'sub_title', resource.data -> 'sub_title',
    'example', resource.data -> 'example',
    'cards', resource.data -> 'cards'
  )),
  resource.data ->> 'original_filename',
  resource.data ->> 'media_type',
  resource.data ->> 'storage_path'
FROM canonical_resources AS resource
WHERE NOT EXISTS (
  SELECT 1 FROM public.resource_assets AS existing WHERE existing.id = resource.asset_id
)
ON CONFLICT (id) DO NOTHING;

WITH latest_versions AS (
  SELECT DISTINCT ON (lesson_id) lesson_id, content
  FROM public.lesson_versions
  ORDER BY lesson_id, version_number DESC, created_at DESC
),
legacy_resources AS (
  SELECT DISTINCT ON (lesson.id, resource.resource ->> 'id')
    lesson.id AS lesson_id,
    lesson.instructor_id,
    resource.resource ->> 'id' AS lesson_resource_id,
    (resource.ordinality - 1)::integer AS position,
    resource.resource AS data
  FROM public.lessons AS lesson
  JOIN latest_versions AS version ON version.lesson_id = lesson.id
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(version.content -> 'lessonResources') = 'array'
        THEN version.content -> 'lessonResources'
      ELSE '[]'::jsonb
    END
  ) WITH ORDINALITY AS resource(resource, ordinality)
  WHERE lesson.instructor_id IS NOT NULL
    AND resource.resource ->> 'id' IS NOT NULL
  ORDER BY lesson.id, resource.resource ->> 'id', resource.ordinality DESC
),
canonical_resources AS (
  SELECT
    legacy.*,
    CASE
      WHEN legacy.data ->> 'resourceHubAssetId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       AND EXISTS (
         SELECT 1 FROM public.resource_assets AS existing
         WHERE existing.id = (legacy.data ->> 'resourceHubAssetId')::uuid
           AND existing.instructor_id = legacy.instructor_id
       )
        THEN (legacy.data ->> 'resourceHubAssetId')::uuid
      ELSE md5(legacy.lesson_id::text || ':' || legacy.lesson_resource_id)::uuid
    END AS asset_id
  FROM legacy_resources AS legacy
)
INSERT INTO public.lesson_resource_links (
  lesson_id, instructor_id, lesson_resource_id, resource_asset_id, position
)
SELECT
  resource.lesson_id,
  resource.instructor_id,
  resource.lesson_resource_id,
  resource.asset_id,
  resource.position
FROM canonical_resources AS resource
JOIN public.resource_assets AS asset
  ON asset.id = resource.asset_id
 AND asset.instructor_id = resource.instructor_id
ON CONFLICT (lesson_id, lesson_resource_id)
DO UPDATE SET resource_asset_id = EXCLUDED.resource_asset_id,
  position = EXCLUDED.position,
  updated_at = now();

WITH latest_versions AS (
  SELECT DISTINCT ON (lesson_id) id, lesson_id, content
  FROM public.lesson_versions
  ORDER BY lesson_id, version_number DESC, created_at DESC
)
UPDATE public.lesson_versions AS version
SET content = jsonb_set(
  version.content,
  '{lessonResources}',
  COALESCE((
    SELECT jsonb_agg(
      CASE WHEN asset.id IS NULL THEN legacy.resource
        ELSE jsonb_build_object(
          'id', link.lesson_resource_id,
          'resourceHubAssetId', asset.id::text,
          'title', asset.title,
          'url', asset.url,
          'type', CASE asset.resource_type
            WHEN 'audio' THEN 'Audio'
            WHEN 'video' THEN 'Video'
            WHEN 'image' THEN 'Image'
            WHEN 'file' THEN 'PDF'
            ELSE 'Article'
          END,
          'resourceType', asset.resource_type,
          'mainCategory', asset.main_category,
          'subCategory', asset.sub_category,
          'cefrLevel', asset.cefr_level,
          'isDownloadable', asset.allow_student_download,
          'tags', asset.tags,
          'importedFromResourceHub', true
        )
      END
      ORDER BY legacy.ordinality
    )
    FROM jsonb_array_elements(version.content -> 'lessonResources')
      WITH ORDINALITY AS legacy(resource, ordinality)
    LEFT JOIN public.lesson_resource_links AS link
      ON link.lesson_id = version.lesson_id
     AND link.lesson_resource_id = legacy.resource ->> 'id'
    LEFT JOIN public.resource_assets AS asset
      ON asset.id = link.resource_asset_id
     AND asset.instructor_id = link.instructor_id
  ), '[]'::jsonb),
  true
)
FROM latest_versions AS latest
WHERE version.id = latest.id
  AND jsonb_typeof(version.content -> 'lessonResources') = 'array';

COMMIT;

NOTIFY pgrst, 'reload schema';
