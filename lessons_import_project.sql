-- Import a lessons_rows.sql export into Fluentia's canonical schema.
-- Requires public.lessons and public.lesson_versions as defined by complete_schema.sql.
-- This is intentionally not compatible with the older flat schema in schema.sql.

DO $$
DECLARE
  missing_columns text;
BEGIN
  IF to_regclass('public.lessons') IS NULL THEN
    RAISE EXCEPTION 'Import requires public.lessons. Apply the Fluentia database migrations first.';
  END IF;

  IF to_regclass('public.lesson_versions') IS NULL THEN
    RAISE EXCEPTION 'Import requires public.lesson_versions. Apply the Fluentia database migrations first.';
  END IF;

  SELECT string_agg(required.table_name || '.' || required.column_name, ', ')
  INTO missing_columns
  FROM (VALUES
    ('lessons', 'id'),
    ('lessons', 'slug'),
    ('lessons', 'title'),
    ('lessons', 'subject'),
    ('lessons', 'grade'),
    ('lessons', 'status'),
    ('lessons', 'student_id'),
    ('lessons', 'instructor_id'),
    ('lessons', 'tags'),
    ('lessons', 'assigned_all_students'),
    ('lessons', 'is_published'),
    ('lessons', 'created_at'),
    ('lessons', 'updated_at'),
    ('lesson_versions', 'lesson_id'),
    ('lesson_versions', 'version_number'),
    ('lesson_versions', 'content'),
    ('lesson_versions', 'changes_summary'),
    ('lesson_versions', 'created_at')
  ) AS required(table_name, column_name)
  LEFT JOIN information_schema.columns AS actual
    ON actual.table_schema = 'public'
    AND actual.table_name = required.table_name
    AND actual.column_name = required.column_name
  WHERE actual.column_name IS NULL;

  IF missing_columns IS NOT NULL THEN
    RAISE EXCEPTION 'Incompatible Fluentia schema; missing columns: %', missing_columns;
  END IF;
END;
$$;

BEGIN;

CREATE TEMP TABLE lesson_import_source (
  id uuid PRIMARY KEY,
  slug text NOT NULL,
  title text NOT NULL,
  subtitle text,
  module_number integer,
  status text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  student_id uuid,
  banner_url text,
  instructor_id uuid,
  assigned_all_students boolean NOT NULL,
  domain text,
  theme text,
  skill_focus text,
  estimated_time text,
  is_published boolean NOT NULL,
  level text,
  grade text,
  cefr_level text,
  practice_type text,
  custom_tags text[],
  blocks jsonb NOT NULL,
  content jsonb
) ON COMMIT DROP;

INSERT INTO lesson_import_source (
  id, slug, title, subtitle, module_number, status, created_at, updated_at,
  student_id, banner_url, instructor_id, assigned_all_students, domain,
  theme, skill_focus, estimated_time, is_published, level, grade, cefr_level,
  practice_type, custom_tags, blocks, content
) VALUES
  (
    '346a4947-986c-48ef-a535-cca690c5ba8d', 'untitled-lesson-1791431764538', 'Untitled Lesson',
    'A new Fluentia learning journey.', 1, 'draft', '2026-10-08 03:56:07.392433+00', '2026-10-08 03:56:07.392433+00',
    '4f9e7234-baa4-45a5-8e6d-7584350ccdbd', 'https://plus.unsplash.com/premium_photo-1661775756810-82dbd209fc95?q=80&w=1954&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
    '5eb593ab-48db-4fa2-a6f6-08f9c0af3ee5', false, 'General', 'Critical Thinking', 'Integrated Skills', '45 Mins', false,
    NULL, 'B1', NULL, NULL, NULL, '[]'::jsonb, NULL
  ),
  (
    '359b9f42-b2a9-46e6-87ad-a50bc099d747', 'acquisition-vs-learning-1791741967280', 'Acquisition vs. Learning',
    NULL, NULL, 'draft', '2026-10-11 18:06:10.791261+00', '2026-10-11 18:06:10.791261+00',
    '4f9e7234-baa4-45a5-8e6d-7584350ccdbd', NULL, '5eb593ab-48db-4fa2-a6f6-08f9c0af3ee5', false,
    'General', 'Critical Thinking', 'Integrated Skills', '45 Mins', false, NULL, 'B1', NULL, NULL, NULL, '[]'::jsonb, NULL
  ),
  (
    '45d78ec9-0880-4d6d-aba1-71baa56df902', 'the-power-of-small-habits-1789849105907', 'The Power of Small Habits',
    'Architecting Compound Growth Through Daily Micro-Decisions and Frictionless Systems', 1, 'published',
    '2026-09-19 20:18:29.500709+00', '2026-09-19 20:18:29.500709+00',
    '4f9e7234-baa4-45a5-8e6d-7584350ccdbd', 'https://images.unsplash.com/photo-1582789829727-39505f4e6f94?q=80&w=1176&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
    '5eb593ab-48db-4fa2-a6f6-08f9c0af3ee5', false, 'General', 'Critical Thinking', 'Integrated Skills', '120 Mins', true,
    'C1', 'C1', NULL, NULL, NULL, '[]'::jsonb, NULL
  ),
  (
    '5ba98a89-d870-4680-82cf-acc71062918f', 'untitled-lesson-1791409529559', 'Untitled Lesson',
    NULL, NULL, 'draft', '2026-10-07 21:45:34.397745+00', '2026-10-07 21:45:34.397745+00',
    NULL, NULL, '5eb593ab-48db-4fa2-a6f6-08f9c0af3ee5', false,
    'General', 'Critical Thinking', 'Integrated Skills', '45 Mins', false, NULL, 'B1', NULL, NULL, NULL, '[]'::jsonb, NULL
  ),
  (
    '722edc3b-08e6-4842-b157-52b193fe1939', 'the-immersion-imperative-1791443781599', 'The Immersion Imperative',
    'Living Abroad Without Leaving Home: The Story of Sarah’s Digital Migration', 2, 'published',
    '2026-10-08 07:16:24.873066+00', '2026-10-08 07:16:24.873066+00',
    '4f9e7234-baa4-45a5-8e6d-7584350ccdbd', 'https://b062563db35e.blob.upstash.io/Pocast/Images/study%20room%20desk%20at%20night.png',
    '5eb593ab-48db-4fa2-a6f6-08f9c0af3ee5', false, 'General', 'Critical Thinking', 'Integrated Skills', '45 Mins', true,
    NULL, 'B1', NULL, NULL, NULL, '[]'::jsonb, NULL
  ),
  (
    '7e4d781b-62a8-454e-89bd-33cab5d42626', 'ai-and-the-future-of-work-1-1790387247776', 'AI and the Future of Work',
    'Navigating Automation, Human Value, and Skill Adaptability', 3, 'published',
    '2026-09-26 01:47:30.602749+00', '2026-09-26 01:47:30.602749+00',
    '4358564b-9c9d-4538-83ed-5f9982d7e929', 'https://b062563db35e.blob.upstash.io/Pocast/Images/AI%20and%20future%20of%20work.png',
    '5eb593ab-48db-4fa2-a6f6-08f9c0af3ee5', false, 'General', 'Critical Thinking', 'Integrated Skills', '120 Mins', true,
    'B2', 'B1', NULL, NULL, NULL, '[]'::jsonb, NULL
  ),
  (
    '7fa350a8-ba7a-4055-b3b1-8d5ece812fdc', 'testing-1791380731572', 'Testing',
    'A new Fluentia learning journey.', 32, 'published', '2026-10-07 13:45:34.376257+00', '2026-10-07 13:45:34.376257+00',
    '4f9e7234-baa4-45a5-8e6d-7584350ccdbd', 'https://plus.unsplash.com/premium_photo-1661337109411-45b6478c38b9?q=80&w=1170&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
    '5eb593ab-48db-4fa2-a6f6-08f9c0af3ee5', false, 'General', 'Critical Thinking', 'Integrated Skills', '45 Mins', true,
    NULL, 'C1', NULL, NULL, NULL, '[]'::jsonb, NULL
  ),
  (
    'a1225481-9d34-4804-a393-cb37a281cd5b', 'acquisition-vs-learning-1791741969560', 'Acquisition vs. Learning',
    'The Illusion of Grammar: Why Memorizing Rules Fails in Real Conversations', 2, 'published',
    '2026-10-11 18:06:11.193566+00', '2026-10-11 18:06:11.193566+00',
    '4358564b-9c9d-4538-83ed-5f9982d7e929', 'https://b062563db35e.blob.upstash.io/Images/From%20Grammar%20Rules%20to%20Conversation.png',
    '5eb593ab-48db-4fa2-a6f6-08f9c0af3ee5', false, 'General', 'Critical Thinking', 'Integrated Skills', '45 Mins', true,
    NULL, 'B1', NULL, NULL, NULL, '[]'::jsonb, NULL
  ),
  (
    'bebbda4c-92f8-46e6-b153-0eb684219352', 'ai-and-the-future-of-work-1790363415941', 'AI and the Future of Work TEST',
    'How Form and Function Shape Our Daily Lives', 5, 'published', '2026-09-25 19:10:19.074192+00', '2026-09-25 19:10:19.074192+00',
    '4f9e7234-baa4-45a5-8e6d-7584350ccdbd', 'https://plus.unsplash.com/premium_photo-1676637656166-cb7b3a43b81a?q=80&w=1332&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1w8e6d7584350ccdbd',
    '5eb593ab-48db-4fa2-a6f6-08f9c0af3ee5', false, 'General', 'Critical Thinking', 'Integrated Skills', '120 Mins', true,
    'B2', 'B2', NULL, NULL, NULL, '[]'::jsonb, NULL
  ),
  (
    'bfe95c72-cb2c-4c57-8082-f03bb5bfbbbb', 'applying-to-european-universities-mastering-the-statement-of-purpose-sop-1790958671485',
    E'Applying to European Universities:\nMastering the Statement of Purpose (SOP)',
    'A practical guide to crafting a convincing SOP for Master''s programs in Europe', 1, 'published',
    '2026-10-02 16:31:14.38509+00', '2026-10-02 16:31:14.38509+00',
    '4f9e7234-baa4-45a5-8e6d-7584350ccdbd', 'https://kmpcilwdndrpjhsvdvdc.supabase.co/storage/v1/object/public/lesson-assets/banners/1790980639048-Royal_College_of_Art.jpg',
    '5eb593ab-48db-4fa2-a6f6-08f9c0af3ee5', false, 'General', 'Critical Thinking', 'Integrated Skills', '45 Mins', true,
    NULL, 'B1', NULL, NULL, NULL, '[]'::jsonb, NULL
  ),
  (
    'd958d26a-ec96-4d65-83ce-603b922632d9', 'the-art-of-everyday-design-1790080499657', 'The Art of Everyday Design',
    'How Form and Function Shape Our Daily Lives', 2, 'published', '2026-09-22 12:35:01.987771+00', '2026-09-22 12:35:01.987771+00',
    '4358564b-9c9d-4538-83ed-5f9982d7e929', 'https://images.unsplash.com/photo-1669452431166-03ac947e0981?q=80&w=1332&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
    '5eb593ab-48db-4fa2-a6f6-08f9c0af3ee5', false, 'General', 'Critical Thinking', 'Integrated Skills', '120 Mins', true,
    'B2', 'B1', NULL, NULL, NULL, '[]'::jsonb, NULL
  );

INSERT INTO public.lessons (
  id, slug, title, subtitle, module_number, subject, grade, status, student_id,
  instructor_id, tags, assigned_all_students, is_published, banner_url, created_at, updated_at
)
SELECT
  source.id,
  source.slug,
  source.title,
  source.subtitle,
  source.module_number,
  source.domain,
  COALESCE(NULLIF(upper(source.grade), ''), NULLIF(upper(source.level), ''), 'B1'),
  source.status,
  source.student_id,
  source.instructor_id,
  jsonb_strip_nulls(jsonb_build_object(
    'domain', source.domain,
    'theme', source.theme,
    'skill_focus', source.skill_focus,
    'estimated_time', source.estimated_time,
    'cefr_level', source.cefr_level,
    'practice_type', source.practice_type,
    'custom', to_jsonb(COALESCE(source.custom_tags, ARRAY[]::text[]))
  )),
  source.assigned_all_students,
  source.is_published,
  source.banner_url,
  source.created_at,
  source.updated_at
FROM lesson_import_source AS source
ON CONFLICT (id) DO UPDATE SET
  slug = EXCLUDED.slug,
  title = EXCLUDED.title,
  subtitle = EXCLUDED.subtitle,
  module_number = EXCLUDED.module_number,
  subject = EXCLUDED.subject,
  grade = EXCLUDED.grade,
  status = EXCLUDED.status,
  student_id = EXCLUDED.student_id,
  instructor_id = EXCLUDED.instructor_id,
  tags = EXCLUDED.tags,
  assigned_all_students = EXCLUDED.assigned_all_students,
  is_published = EXCLUDED.is_published,
  banner_url = EXCLUDED.banner_url,
  created_at = EXCLUDED.created_at,
  updated_at = EXCLUDED.updated_at;

INSERT INTO public.lesson_versions (
  lesson_id, version_number, content, changes_summary, created_at
)
SELECT
  source.id,
  1,
  CASE
    WHEN jsonb_typeof(source.content) = 'object' THEN source.content
    ELSE jsonb_build_object(
      'slug', source.slug,
      'title', source.title,
      'subtitle', source.subtitle,
      'moduleNumber', source.module_number,
      'blocks', source.blocks,
      'instructorName', 'AVoss',
      'instructorInitials', 'AV',
      'level', source.level,
      'grade', COALESCE(NULLIF(upper(source.grade), ''), NULLIF(upper(source.level), ''), 'B1'),
      'domain', source.domain,
      'theme', source.theme,
      'skillFocus', source.skill_focus,
      'estimatedTime', source.estimated_time,
      'cefrLevel', source.cefr_level,
      'practiceType', source.practice_type,
      'customTags', to_jsonb(COALESCE(source.custom_tags, ARRAY[]::text[])),
      'tags', jsonb_strip_nulls(jsonb_build_object(
        'domain', source.domain,
        'theme', source.theme,
        'skill_focus', source.skill_focus,
        'estimated_time', source.estimated_time,
        'cefr_level', source.cefr_level,
        'practice_type', source.practice_type,
        'custom', to_jsonb(COALESCE(source.custom_tags, ARRAY[]::text[]))
      ))
    )
  END,
  'Imported from lessons_rows.sql',
  source.created_at
FROM lesson_import_source AS source
ON CONFLICT (lesson_id, version_number) DO UPDATE SET
  content = EXCLUDED.content,
  changes_summary = EXCLUDED.changes_summary,
  created_at = EXCLUDED.created_at;

COMMIT;
