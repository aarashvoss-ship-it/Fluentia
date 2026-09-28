ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS tags jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'lessons_tags_object_check'
      AND conrelid = 'public.lessons'::regclass
  ) THEN
    ALTER TABLE public.lessons
      ADD CONSTRAINT lessons_tags_object_check
      CHECK (jsonb_typeof(tags) = 'object');
  END IF;
END
$$;

ALTER TABLE public.lessons
  ALTER COLUMN grade SET DEFAULT 'B1';

WITH latest_versions AS (
  SELECT DISTINCT ON (lesson_id) lesson_id, content
  FROM public.lesson_versions
  ORDER BY lesson_id, version_number DESC, created_at DESC
)
UPDATE public.lessons AS lesson
SET grade = CASE
  WHEN upper(coalesce(lesson.grade, '')) IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2') THEN upper(lesson.grade)
  WHEN upper(coalesce(version.content->>'level', version.content->>'cefrLevel', '')) IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')
    THEN upper(coalesce(version.content->>'level', version.content->>'cefrLevel'))
  ELSE 'B1'
END
FROM latest_versions AS version
WHERE lesson.id = version.lesson_id;

UPDATE public.lessons
SET grade = CASE
  WHEN upper(coalesce(grade, '')) IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2') THEN upper(grade)
  ELSE 'B1'
END
WHERE grade IS NULL OR upper(grade) NOT IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2');

ALTER TABLE public.lessons
  ALTER COLUMN grade SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'lessons_grade_cefr_check'
      AND conrelid = 'public.lessons'::regclass
  ) THEN
    ALTER TABLE public.lessons
      ADD CONSTRAINT lessons_grade_cefr_check
      CHECK (grade IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2'));
  END IF;
END
$$;

WITH latest_versions AS (
  SELECT DISTINCT ON (lesson_id) lesson_id, content
  FROM public.lesson_versions
  ORDER BY lesson_id, version_number DESC, created_at DESC
)
UPDATE public.lessons AS lesson
SET tags = CASE
  WHEN jsonb_typeof(version.content->'tags') = 'object' THEN version.content->'tags'
  ELSE jsonb_strip_nulls(jsonb_build_object(
    'domain', coalesce(nullif(version.content->>'domain', ''), nullif(version.content->>'topicDomain', '')),
    'skill_focus', coalesce(nullif(version.content->>'skill_focus', ''), nullif(version.content->>'skillFocus', ''), nullif(version.content->>'primarySkill', '')),
    'practice_type', coalesce(nullif(version.content->>'practice_type', ''), nullif(version.content->>'practiceType', '')),
    'custom', '[]'::jsonb
  ))
END
FROM latest_versions AS version
WHERE lesson.id = version.lesson_id
  AND lesson.tags = '{}'::jsonb;