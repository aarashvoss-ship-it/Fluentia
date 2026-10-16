export const RUNTIME_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  password_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS password_hash text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_key
  ON public.users (lower(email))
  WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.students (
  id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, token)
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY,
  token text UNIQUE NOT NULL,
  full_name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'student',
  email text,
  level text,
  target_level text,
  target_goal text,
  core_goal text,
  focus_weaknesses jsonb NOT NULL DEFAULT '[]'::jsonb,
  assigned_instructor text,
  dashboard_note text,
  avatar_url text,
  banner_url text,
  avatar_bg_color text,
  avatar_initials text,
  enrolled_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS token text,
  ADD COLUMN IF NOT EXISTS full_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'student',
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS level text,
  ADD COLUMN IF NOT EXISTS target_level text,
  ADD COLUMN IF NOT EXISTS target_goal text,
  ADD COLUMN IF NOT EXISTS core_goal text,
  ADD COLUMN IF NOT EXISTS focus_weaknesses jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS assigned_instructor text,
  ADD COLUMN IF NOT EXISTS dashboard_note text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS banner_url text,
  ADD COLUMN IF NOT EXISTS avatar_bg_color text,
  ADD COLUMN IF NOT EXISTS avatar_initials text,
  ADD COLUMN IF NOT EXISTS enrolled_date date,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
DECLARE
  constraint_row record;
BEGIN
  FOR constraint_row IN
    SELECT constraint_row.conname
    FROM pg_constraint AS constraint_row
    WHERE constraint_row.conrelid = 'public.profiles'::regclass
      AND constraint_row.contype = 'f'
      AND constraint_row.confrelid = to_regclass('auth.users')
      AND constraint_row.conkey @> ARRAY[
        (SELECT attnum FROM pg_attribute
         WHERE attrelid = 'public.profiles'::regclass AND attname = 'id')
      ]::smallint[]
  LOOP
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', constraint_row.conname);
  END LOOP;
END;
$$;

CREATE TABLE IF NOT EXISTS public.lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  subject text,
  grade text NOT NULL DEFAULT 'B1',
  status text NOT NULL DEFAULT 'draft',
  student_id uuid,
  instructor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT 'Untitled lesson',
  ADD COLUMN IF NOT EXISTS subject text,
  ADD COLUMN IF NOT EXISTS grade text NOT NULL DEFAULT 'B1',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS student_id uuid,
  ADD COLUMN IF NOT EXISTS instructor_id uuid,
  ADD COLUMN IF NOT EXISTS subtitle text,
  ADD COLUMN IF NOT EXISTS module_number integer,
  ADD COLUMN IF NOT EXISTS banner_url text,
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS instructor_note text,
  ADD COLUMN IF NOT EXISTS instructor_guidance text,
  ADD COLUMN IF NOT EXISTS student_token text,
  ADD COLUMN IF NOT EXISTS tags jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS assigned_all_students boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.lesson_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  content jsonb NOT NULL,
  changes_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lesson_id, version_number)
);

CREATE TABLE IF NOT EXISTS public.lesson_assignments (
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'assigned',
  PRIMARY KEY (lesson_id, student_id)
);

CREATE INDEX IF NOT EXISTS lessons_slug_key ON public.lessons (slug) WHERE slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS lesson_assignments_student_idx ON public.lesson_assignments (student_id);

ALTER TABLE public.lesson_assignments
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'assigned';

ALTER TABLE public.lesson_assignments
  DROP CONSTRAINT IF EXISTS lesson_assignments_student_id_fkey;

CREATE TABLE IF NOT EXISTS public.submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'submitted',
  submitted_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS lesson_id uuid,
  ADD COLUMN IF NOT EXISTS student_id uuid,
  ADD COLUMN IF NOT EXISTS answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'submitted',
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.submissions DROP CONSTRAINT IF EXISTS submissions_status_check;
UPDATE public.submissions
SET status = 'pending_evaluation'
WHERE status IS NULL
   OR status NOT IN ('draft', 'not_started', 'in_progress', 'submitted', 'pending_evaluation', 'completed', 'reviewed', 'evaluated');
ALTER TABLE public.submissions
  ALTER COLUMN status SET DEFAULT 'in_progress',
  ALTER COLUMN status SET NOT NULL,
  ADD CONSTRAINT submissions_status_check
    CHECK (status IN ('draft', 'not_started', 'in_progress', 'submitted', 'pending_evaluation', 'completed', 'reviewed', 'evaluated'));

CREATE INDEX IF NOT EXISTS submissions_lesson_student_latest_idx
  ON public.submissions (lesson_id, student_id, submitted_at DESC);

CREATE TABLE IF NOT EXISTS public.instructor_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  instructor_id uuid,
  scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  rubric_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  total_score integer NOT NULL DEFAULT 0,
  criterion_feedback jsonb NOT NULL DEFAULT '{}'::jsonb,
  comments text,
  strengths text,
  areas_to_improve text,
  study_hub_prescription text,
  voice_feedback_url text,
  is_published boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lesson_id, student_id)
);

ALTER TABLE public.instructor_feedback
  ADD COLUMN IF NOT EXISTS instructor_id uuid,
  ADD COLUMN IF NOT EXISTS scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS rubric_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS total_score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS criterion_feedback jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS comments text,
  ADD COLUMN IF NOT EXISTS strengths text,
  ADD COLUMN IF NOT EXISTS areas_to_improve text,
  ADD COLUMN IF NOT EXISTS study_hub_prescription text,
  ADD COLUMN IF NOT EXISTS voice_feedback_url text,
  ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS instructor_feedback_lesson_student_key
  ON public.instructor_feedback (lesson_id, student_id);

CREATE TABLE IF NOT EXISTS public.instructor_evaluation_drafts (
  submission_id uuid PRIMARY KEY REFERENCES public.submissions(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  instructor_id uuid NOT NULL,
  evaluation jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_vocab (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  word text NOT NULL,
  part_of_speech text,
  definition text NOT NULL,
  example text,
  pronunciation_url text,
  source text,
  saved_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, word)
);

CREATE TABLE IF NOT EXISTS public.user_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  text text NOT NULL,
  lesson_slug text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  message text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.resource_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  instructor_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  main_category text NOT NULL,
  sub_category text NOT NULL,
  url text NOT NULL,
  cefr_level text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  allow_student_download boolean NOT NULL DEFAULT true
);

ALTER TABLE public.resource_assets
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS main_category text NOT NULL DEFAULT 'others',
  ADD COLUMN IF NOT EXISTS sub_category text NOT NULL DEFAULT 'General',
  ADD COLUMN IF NOT EXISTS url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS cefr_level text NOT NULL DEFAULT 'All Levels',
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS allow_student_download boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
DECLARE
  constraint_row record;
BEGIN
  FOR constraint_row IN
    SELECT constraint_row.conname
    FROM pg_constraint AS constraint_row
    WHERE constraint_row.conrelid = 'public.resource_assets'::regclass
      AND constraint_row.contype = 'f'
      AND constraint_row.confrelid = to_regclass('auth.users')
  LOOP
    EXECUTE format('ALTER TABLE public.resource_assets DROP CONSTRAINT %I', constraint_row.conname);
  END LOOP;
END;
$$;

CREATE TABLE IF NOT EXISTS public.student_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  student_token text NOT NULL DEFAULT '',
  lesson_id uuid REFERENCES public.lessons(id) ON DELETE CASCADE,
  type text,
  resource_type text NOT NULL DEFAULT 'note',
  title text NOT NULL,
  body text,
  link_url text,
  question text,
  answer text,
  explanation text,
  subtitle text,
  sub_title text,
  example text,
  cards jsonb NOT NULL DEFAULT '[]'::jsonb,
  original_filename text,
  media_type text,
  storage_path text,
  is_external_url boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.student_resources
  ADD COLUMN IF NOT EXISTS student_token text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS lesson_id uuid,
  ADD COLUMN IF NOT EXISTS type text,
  ADD COLUMN IF NOT EXISTS resource_type text NOT NULL DEFAULT 'note',
  ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS body text,
  ADD COLUMN IF NOT EXISTS link_url text,
  ADD COLUMN IF NOT EXISTS question text,
  ADD COLUMN IF NOT EXISTS answer text,
  ADD COLUMN IF NOT EXISTS explanation text,
  ADD COLUMN IF NOT EXISTS subtitle text,
  ADD COLUMN IF NOT EXISTS sub_title text,
  ADD COLUMN IF NOT EXISTS example text,
  ADD COLUMN IF NOT EXISTS cards jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS original_filename text,
  ADD COLUMN IF NOT EXISTS media_type text,
  ADD COLUMN IF NOT EXISTS storage_path text,
  ADD COLUMN IF NOT EXISTS is_external_url boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.student_resources
  ALTER COLUMN student_token SET DEFAULT '',
  DROP CONSTRAINT IF EXISTS student_resources_student_identity_fkey;

CREATE INDEX IF NOT EXISTS student_resources_student_lesson_idx
  ON public.student_resources (student_id, lesson_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.student_lesson_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  student_token text NOT NULL DEFAULT '',
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  source_resource_id text NOT NULL,
  source_type text NOT NULL DEFAULT 'lesson',
  resource jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, lesson_id, source_resource_id)
);

CREATE INDEX IF NOT EXISTS student_lesson_resources_student_lesson_idx
  ON public.student_lesson_resources (student_id, lesson_id, created_at DESC);

ALTER TABLE public.student_lesson_resources
  ALTER COLUMN student_token SET DEFAULT '',
  DROP CONSTRAINT IF EXISTS student_lesson_resources_student_identity_fkey;

CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id text,
  instructor_id text NOT NULL,
  sender_id text NOT NULL,
  receiver_id text NOT NULL,
  tab_type text NOT NULL CHECK (tab_type IN ('active', 'support')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

CREATE INDEX IF NOT EXISTS messages_student_thread_idx
  ON public.messages (instructor_id, student_id, tab_type, created_at);
CREATE INDEX IF NOT EXISTS messages_unread_idx
  ON public.messages (instructor_id, receiver_id, read_at);

CREATE TABLE IF NOT EXISTS public.media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  content_type text NOT NULL,
  data bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.lessons
  (id, title, subtitle, module_number, slug, subject, grade, status, is_published, assigned_all_students, tags)
SELECT
  'b1b10001-1001-4001-8001-000000000001'::uuid,
  'The Architecture of Daily Habits',
  'A practical lesson about routines, friction, and sustainable change.',
  1,
  'the-architecture-of-daily-habits-b1',
  'English',
  'B1',
  'published',
  true,
  true,
  '{"domain":"Lifestyle","skill_focus":"Reading and writing","practice_type":"Guided practice","custom":[]}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.lessons
  WHERE (status = 'published' OR is_published = true)
    AND instructor_id IS NOT NULL
)
ON CONFLICT (id) DO NOTHING;

UPDATE public.lessons
SET instructor_id = (
      SELECT profiles.id
      FROM public.profiles AS profiles
      WHERE profiles.role IN ('instructor', 'admin')
      ORDER BY CASE profiles.role WHEN 'instructor' THEN 0 ELSE 1 END, profiles.created_at
      LIMIT 1
    ),
    status = 'published',
    is_published = true,
    assigned_all_students = true,
    updated_at = now()
WHERE id = 'b1b10001-1001-4001-8001-000000000001'::uuid
  AND instructor_id IS NULL;

INSERT INTO public.lesson_versions (lesson_id, version_number, content, changes_summary)
SELECT
  'b1b10001-1001-4001-8001-000000000001'::uuid,
  1,
  $lesson$
  {
    "slug": "the-architecture-of-daily-habits-b1",
    "title": "The Architecture of Daily Habits",
    "subtitle": "A practical lesson about routines, friction, and sustainable change.",
    "moduleNumber": 1,
    "warm_up": {
      "intro_narrative": {"text": "Small changes become easier when the environment supports them.", "enabled": true},
      "quote": {"text": "What habit would you like to make easier?", "enabled": true}
    },
    "lesson": {
      "core_concept": {"text": "Design the environment around the behavior you want to repeat.", "enabled": true},
      "examples": [
        {"text": "Put a book beside your bed to make reading more visible.", "enabled": true},
        {"text": "Prepare your running clothes the night before to reduce friction.", "enabled": true}
      ]
    },
    "listening": {
      "transcript": {"text": "Listen for the ideas about cues, friction, and repetition.", "enabled": true},
      "questions": []
    },
    "reading": {
      "article_markdown": {"text": "A reliable routine begins with a clear cue and a manageable first step.", "enabled": true},
      "analytical_questions": []
    },
    "writing": {
      "prompt": {"text": "Describe one routine you want to improve and the first small step you will take.", "enabled": true},
      "draft_editor": {"enabled": true, "placeholder": "Write your response here..."}
    },
    "speaking": {
      "scenario": {"text": "Explain your habit plan aloud in two or three sentences.", "enabled": true},
      "audio_capture": {"enabled": false}
    },
    "results": {}
  }
  $lesson$::jsonb,
  'Initial sample lesson'
WHERE EXISTS (
  SELECT 1 FROM public.lessons WHERE id = 'b1b10001-1001-4001-8001-000000000001'::uuid
)
AND NOT EXISTS (
  SELECT 1 FROM public.lesson_versions
  WHERE lesson_id = 'b1b10001-1001-4001-8001-000000000001'::uuid
);

INSERT INTO public.lesson_assignments (lesson_id, student_id)
SELECT 'b1b10001-1001-4001-8001-000000000001'::uuid, profiles.id
FROM public.profiles AS profiles
WHERE profiles.role = 'student'
  AND EXISTS (SELECT 1 FROM public.lessons WHERE id = 'b1b10001-1001-4001-8001-000000000001'::uuid)
ON CONFLICT (lesson_id, student_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.instructors (
  id uuid PRIMARY KEY,
  name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  slug text NOT NULL DEFAULT '',
  token text NOT NULL DEFAULT '',
  specialization text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active',
  max_student_capacity integer NOT NULL DEFAULT 20,
  bio text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.instructors
  ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS slug text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS token text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS specialization text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS max_student_capacity integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS bio text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS instructors_email_lower_key ON public.instructors (lower(email)) WHERE email <> '';
CREATE UNIQUE INDEX IF NOT EXISTS instructors_slug_key ON public.instructors (slug) WHERE slug <> '';
CREATE UNIQUE INDEX IF NOT EXISTS instructors_token_key ON public.instructors (token) WHERE token <> '';

DO $$
DECLARE
  constraint_row record;
BEGIN
  FOR constraint_row IN
    SELECT constraint_row.conname
    FROM pg_constraint AS constraint_row
    WHERE constraint_row.conrelid = 'public.instructors'::regclass
      AND constraint_row.contype = 'f'
      AND constraint_row.confrelid = to_regclass('auth.users')
  LOOP
    EXECUTE format('ALTER TABLE public.instructors DROP CONSTRAINT %I', constraint_row.conname);
  END LOOP;
END;
$$;

CREATE TABLE IF NOT EXISTS public.allowed_users (
  email text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.waitlist_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.waitlist_requests
  ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS waitlist_requests_email_lower_key
  ON public.waitlist_requests (lower(email));
`;
