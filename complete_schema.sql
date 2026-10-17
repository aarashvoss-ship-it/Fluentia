CREATE SCHEMA IF NOT EXISTS public;

-- Fluentia native PostgreSQL schema.
-- Intended for a new database. The application enforces access through its
-- authenticated server APIs; do not expose a privileged database connection to clients.

BEGIN;

CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  password_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_key
  ON public.users (lower(email))
  WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  full_name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'student'
    CHECK (role IN ('student', 'instructor', 'admin')),
  email text,
  level text,
  target_level text,
  target_goal text,
  core_goal text,
  focus_weaknesses jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(focus_weaknesses) = 'array'),
  assigned_instructor text,
  dashboard_note text,
  avatar_url text,
  banner_url text,
  avatar_bg_color text,
  avatar_initials text,
  enrolled_date date NOT NULL DEFAULT current_date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profiles_role_idx ON public.profiles (role);
CREATE INDEX IF NOT EXISTS profiles_email_lower_idx ON public.profiles (lower(email));

CREATE TABLE IF NOT EXISTS public.students (
  id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, token)
);

CREATE TABLE IF NOT EXISTS public.instructors (
  id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  token text NOT NULL UNIQUE,
  specialization text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'on_leave')),
  max_student_capacity integer NOT NULL DEFAULT 20
    CHECK (max_student_capacity > 0),
  bio text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

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

CREATE UNIQUE INDEX IF NOT EXISTS waitlist_requests_email_lower_key
  ON public.waitlist_requests (lower(email));

CREATE TABLE IF NOT EXISTS public.lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  subject text,
  grade text NOT NULL DEFAULT 'B1',
  status text NOT NULL DEFAULT 'draft',
  student_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  instructor_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  subtitle text,
  module_number integer,
  banner_url text,
  slug text UNIQUE,
  instructor_note text,
  instructor_guidance text,
  student_token text,
  tags jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(tags) = 'object'),
  assigned_all_students boolean NOT NULL DEFAULT false,
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lessons_instructor_created_idx
  ON public.lessons (instructor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS lessons_student_idx ON public.lessons (student_id);
CREATE INDEX IF NOT EXISTS lessons_publication_idx
  ON public.lessons (status, is_published);

CREATE TABLE IF NOT EXISTS public.lesson_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  version_number integer NOT NULL CHECK (version_number > 0),
  content jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(content) = 'object'),
  changes_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lesson_id, version_number)
);

CREATE INDEX IF NOT EXISTS lesson_versions_latest_idx
  ON public.lesson_versions (lesson_id, version_number DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS public.lesson_assignments (
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'assigned'
    CHECK (status IN ('assigned', 'completed', 'revoked')),
  PRIMARY KEY (lesson_id, student_id)
);

CREATE INDEX IF NOT EXISTS lesson_assignments_student_status_idx
  ON public.lesson_assignments (student_id, status);

CREATE TABLE IF NOT EXISTS public.submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(answers) = 'object'),
  status text NOT NULL DEFAULT 'in_progress'
    CHECK (status IN (
      'draft', 'not_started', 'in_progress', 'submitted',
      'pending_evaluation', 'completed', 'reviewed', 'evaluated'
    )),
  submitted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS submissions_lesson_student_latest_idx
  ON public.submissions (lesson_id, student_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS submissions_status_latest_idx
  ON public.submissions (status, submitted_at DESC);

CREATE TABLE IF NOT EXISTS public.instructor_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  instructor_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  rubric_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  total_score numeric NOT NULL DEFAULT 0,
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

CREATE TABLE IF NOT EXISTS public.instructor_evaluation_drafts (
  submission_id uuid PRIMARY KEY REFERENCES public.submissions(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  instructor_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  evaluation jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(evaluation) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_vocab (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  word text NOT NULL,
  part_of_speech text,
  definition text NOT NULL,
  example text,
  pronunciation_url text,
  source text,
  saved_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, word)
);

CREATE INDEX IF NOT EXISTS user_vocab_user_saved_idx
  ON public.user_vocab (user_id, saved_at DESC);

CREATE TABLE IF NOT EXISTS public.user_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  text text NOT NULL,
  lesson_slug text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_notes_user_updated_idx
  ON public.user_notes (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.student_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  student_token text NOT NULL DEFAULT '',
  lesson_id uuid REFERENCES public.lessons(id) ON DELETE CASCADE,
  type text,
  resource_type text NOT NULL DEFAULT 'note'
    CHECK (resource_type IN (
      'note', 'reading', 'flashcard', 'flashcards', 'quiz', 'audio',
      'data_table', 'file', 'image', 'video', 'links'
    )),
  title text NOT NULL,
  body text,
  link_url text,
  question text,
  answer text,
  explanation text,
  subtitle text,
  sub_title text,
  example text,
  cards jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(cards) = 'array'),
  original_filename text,
  media_type text,
  storage_path text,
  is_external_url boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS student_resources_student_lesson_idx
  ON public.student_resources (student_id, lesson_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.student_lesson_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  student_token text NOT NULL DEFAULT '',
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  source_resource_id text NOT NULL,
  source_type text NOT NULL DEFAULT 'lesson'
    CHECK (source_type IN ('lesson', 'custom')),
  resource jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(resource) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, lesson_id, source_resource_id)
);

CREATE INDEX IF NOT EXISTS student_lesson_resources_student_lesson_idx
  ON public.student_lesson_resources (student_id, lesson_id, created_at DESC);

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

CREATE TABLE IF NOT EXISTS public.banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  message text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS banners_active_created_idx
  ON public.banners (is_active, created_at DESC);

CREATE TABLE IF NOT EXISTS public.resource_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  main_category text NOT NULL
    CHECK (main_category IN ('documents', 'videos', 'audios', 'visuals', 'others')),
  sub_category text NOT NULL,
  url text NOT NULL,
  allow_student_download boolean NOT NULL DEFAULT true,
  cefr_level text NOT NULL
    CHECK (cefr_level IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'All Levels')),
  tags text[] NOT NULL DEFAULT '{}'::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS resource_assets_instructor_created_idx
  ON public.resource_assets (instructor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS resource_assets_study_room_music_idx
  ON public.resource_assets (main_category, sub_category)
  WHERE main_category = 'audios';

CREATE TABLE IF NOT EXISTS public.media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  content_type text NOT NULL,
  data bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS media_assets_owner_created_idx
  ON public.media_assets (owner_id, created_at DESC);

-- Seed a published, all-students sample lesson if no instructor-owned
-- published lesson is available. Existing sample edits are preserved.
INSERT INTO public.lessons (
  id, title, subtitle, module_number, slug, subject, grade, status,
  instructor_id, is_published, assigned_all_students, tags
)
SELECT
  'b1b10001-1001-4001-8001-000000000001'::uuid,
  'The Architecture of Daily Habits',
  'A practical lesson about routines, friction, and sustainable change.',
  1,
  'the-architecture-of-daily-habits-b1',
  'English',
  'B1',
  'published',
  COALESCE(
    (
      SELECT profile.id
      FROM public.profiles AS profile
      WHERE profile.role IN ('instructor', 'admin')
      ORDER BY CASE profile.role WHEN 'instructor' THEN 0 ELSE 1 END, profile.created_at
      LIMIT 1
    ),
    (
      SELECT instructor.id
      FROM public.instructors AS instructor
      ORDER BY instructor.created_at
      LIMIT 1
    )
  ),
  true,
  true,
  '{"domain":"Lifestyle","skill_focus":"Reading and writing","practice_type":"Guided practice","custom":[]}'::jsonb
WHERE NOT EXISTS (
  SELECT 1
  FROM public.lessons
  WHERE (status = 'published' OR is_published = true)
    AND instructor_id IS NOT NULL
)
ON CONFLICT (id) DO NOTHING;

UPDATE public.lessons AS sample
SET instructor_id = COALESCE(
      (
        SELECT profile.id
        FROM public.profiles AS profile
        WHERE profile.role IN ('instructor', 'admin')
        ORDER BY CASE profile.role WHEN 'instructor' THEN 0 ELSE 1 END, profile.created_at
        LIMIT 1
      ),
      (
        SELECT instructor.id
        FROM public.instructors AS instructor
        ORDER BY instructor.created_at
        LIMIT 1
      )
    ),
    status = 'published',
    is_published = true,
    assigned_all_students = true,
    updated_at = now()
WHERE sample.id = 'b1b10001-1001-4001-8001-000000000001'::uuid
  AND sample.instructor_id IS NULL;

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
  SELECT 1
  FROM public.lessons
  WHERE id = 'b1b10001-1001-4001-8001-000000000001'::uuid
)
AND NOT EXISTS (
  SELECT 1
  FROM public.lesson_versions
  WHERE lesson_id = 'b1b10001-1001-4001-8001-000000000001'::uuid
);

INSERT INTO public.lesson_assignments (lesson_id, student_id, status)
SELECT
  'b1b10001-1001-4001-8001-000000000001'::uuid,
  profile.id,
  'assigned'
FROM public.profiles AS profile
WHERE profile.role = 'student'
  AND EXISTS (
    SELECT 1 FROM public.lessons
    WHERE id = 'b1b10001-1001-4001-8001-000000000001'::uuid
  )
ON CONFLICT (lesson_id, student_id) DO NOTHING;

INSERT INTO public.allowed_users (email)
VALUES
  ('aarashvoss@gmail.com'),
  ('aarashvossoughi@gmail.com'),
  ('f.soheilikia.lastqueen2002@gmail.com')
ON CONFLICT (email) DO NOTHING;

COMMIT;
