CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  password_hash text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_lower_key ON public.users (lower(email));

CREATE TABLE public.lessons (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  level text,
  module_number integer,
  instructor_name text DEFAULT 'AVoss'::text,
  instructor_initials text DEFAULT 'AV'::text,
  blocks jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text DEFAULT 'draft'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  subtitle text,
  student_id text,
  student_token text,
  banner_url text,
  content jsonb,
  instructor_id uuid,
  assigned_all_students boolean NOT NULL DEFAULT false,
  domain text DEFAULT 'General'::text,
  theme text DEFAULT 'Critical Thinking'::text,
  skill_focus text DEFAULT 'Integrated Skills'::text,
  estimated_time text DEFAULT '45 Mins'::text,
  is_published boolean DEFAULT false,
  grade text,
  cefr_level text,
  practice_type text,
  custom_tags text[],
  CONSTRAINT lessons_pkey PRIMARY KEY (id)
);
CREATE TABLE public.student_submissions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  lesson_id text NOT NULL,
  student_id text NOT NULL,
  student_name text DEFAULT 'Arash Vossoughi'::text,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  submitted_at timestamp with time zone DEFAULT now(),
  status text DEFAULT 'submitted'::text,
  CONSTRAINT student_submissions_pkey PRIMARY KEY (id)
);
CREATE TABLE public.instructor_feedback (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  submission_id uuid,
  rubric_scores jsonb DEFAULT '{}'::jsonb,
  strengths text,
  improvements text,
  voice_note_url text,
  reviewed_at timestamp with time zone DEFAULT now(),
  lesson_id text,
  lesson_id_uuid uuid,
  student_id text,
  feedback_text text,
  audio_url text,
  status text DEFAULT 'active'::text,
  updated_at timestamp with time zone DEFAULT now(),
  comments text,
  total_score numeric NOT NULL DEFAULT 0,
  criterion_feedback jsonb NOT NULL DEFAULT '{}'::jsonb,
  areas_to_improve text,
  study_hub_prescription text,
  voice_feedback_url text,
  is_published boolean NOT NULL DEFAULT false,
  instructor_id uuid,
  CONSTRAINT instructor_feedback_pkey PRIMARY KEY (id),
  CONSTRAINT instructor_feedback_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.student_submissions(id)
);
CREATE TABLE public.user_vocab (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  word text NOT NULL,
  definition text,
  phonetic text,
  audio_url text,
  saved_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_vocab_pkey PRIMARY KEY (id)
);
CREATE TABLE public.user_notes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  lesson_id text NOT NULL,
  content text,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_notes_pkey PRIMARY KEY (id)
);
CREATE TABLE public.instructors (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  token text UNIQUE,
  name text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  email text UNIQUE,
  slug text UNIQUE,
  CONSTRAINT instructors_pkey PRIMARY KEY (id)
);
CREATE TABLE public.students (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  token text UNIQUE,
  name text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  email text UNIQUE,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT students_pkey PRIMARY KEY (id)
);
CREATE TABLE public.submissions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  student_id uuid,
  lesson_id uuid,
  assignment_content text,
  status text DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['draft'::text, 'in_progress'::text, 'submitted'::text, 'pending_evaluation'::text, 'evaluated'::text, 'completed'::text]::text[])),
  feedback text,
  grade text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  student_token text,
  answers jsonb,
  submitted_at timestamp with time zone DEFAULT now(),
  answers_data jsonb,
  CONSTRAINT submissions_pkey PRIMARY KEY (id),
  CONSTRAINT submissions_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id),
  CONSTRAINT submissions_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.lessons(id)
);
CREATE TABLE public.lesson_versions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  lesson_id uuid,
  version_number integer NOT NULL DEFAULT 1,
  content jsonb NOT NULL DEFAULT '[]'::jsonb,
  changes_summary text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT lesson_versions_pkey PRIMARY KEY (id),
  CONSTRAINT lesson_versions_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.lessons(id)
);
CREATE TABLE public.messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL,
  receiver_id uuid,
  tab_type text NOT NULL DEFAULT 'all_students'::text,
  content text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  is_read boolean DEFAULT false,
  CONSTRAINT messages_pkey PRIMARY KEY (id)
);
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  token text UNIQUE,
  full_name text NOT NULL,
  role text NOT NULL CHECK (role = ANY (ARRAY['student'::text, 'instructor'::text, 'admin'::text]::text[])),
  level text,
  target_goal text,
  avatar_url text,
  banner_url text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  learning_goal text DEFAULT 'Not set'::text,
  instructor_note text,
  avatar_bg_color text DEFAULT 'amber'::text,
  avatar_initials text,
  custom_avatar_url text,
  custom_banner_url text,
  core_goal text,
  focus_weaknesses jsonb NOT NULL DEFAULT '[]'::jsonb,
  assigned_instructor text,
  dashboard_note text,
  current_level text,
  enrolled_date text,
  email text,
  CONSTRAINT profiles_pkey PRIMARY KEY (id)
);
ALTER TABLE public.lessons
  ADD CONSTRAINT lessons_instructor_id_fkey
  FOREIGN KEY (instructor_id) REFERENCES public.profiles(id);

CREATE TABLE public.lesson_assignments (
  lesson_id uuid NOT NULL,
  student_id uuid NOT NULL,
  assigned_at timestamp with time zone DEFAULT now(),
  status text DEFAULT 'assigned'::text,
  CONSTRAINT lesson_assignments_pkey PRIMARY KEY (lesson_id, student_id),
  CONSTRAINT lesson_assignments_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.lessons(id),
  CONSTRAINT lesson_assignments_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.allowed_users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT allowed_users_pkey PRIMARY KEY (id)
);
CREATE TABLE public.waitlist (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT waitlist_pkey PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public.waitlist_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS waitlist_requests_email_lower_key
  ON public.waitlist_requests (lower(email));
CREATE TABLE public.student_profiles (
  student_id text UNIQUE,
  core_goal text,
  focus_weaknesses text,
  dashboard_note text,
  level text,
  updated_at timestamp with time zone DEFAULT now(),
  instructor_notes text,
  student_token text UNIQUE,
  learning_goal text DEFAULT 'Not set'::text,
  instructor_note text,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  assigned_instructor text DEFAULT 'Fluentia Instructor'::text,
  CONSTRAINT student_profiles_pkey PRIMARY KEY (id)
);
CREATE TABLE public.student_resources (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  student_id text,
  student_token text,
  type text NOT NULL,
  title text NOT NULL,
  content jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  lesson_id text,
  audio_url text,
  file_url text,
  description text,
  answer text,
  body text,
  explanation text,
  options jsonb,
  category text,
  tags text[],
  link_url text,
  url text,
  resource_type text,
  question text,
  original_filename text,
  media_type text,
  storage_path text,
  is_external_url boolean NOT NULL DEFAULT false,
  cards jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(cards) = 'array'::text),
  CONSTRAINT student_resources_pkey PRIMARY KEY (id)
);
CREATE TABLE public.ambient_tracks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text,
  url text UNIQUE,
  created_at timestamp with time zone DEFAULT now(),
  lesson_id text,
  is_active boolean DEFAULT true,
  audio_url text,
  sort_order integer DEFAULT 0,
  source_type text DEFAULT 'stream'::text,
  CONSTRAINT ambient_tracks_pkey PRIMARY KEY (id)
);
CREATE TABLE public.ambient_music (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text,
  url text,
  audio_url text,
  lesson_id text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT ambient_music_pkey PRIMARY KEY (id)
);
CREATE TABLE public.ambient_sounds (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  lesson_id text,
  title text,
  url text,
  audio_url text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT ambient_sounds_pkey PRIMARY KEY (id)
);
CREATE TABLE public.instructor_evaluation_drafts (
  submission_id uuid NOT NULL,
  lesson_id uuid NOT NULL,
  student_id uuid NOT NULL,
  instructor_id uuid NOT NULL,
  evaluation jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT instructor_evaluation_drafts_pkey PRIMARY KEY (submission_id),
  CONSTRAINT instructor_evaluation_drafts_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.lessons(id),
  CONSTRAINT instructor_evaluation_drafts_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.submissions(id)
);
CREATE TABLE public.resource_assets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  instructor_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  main_category text NOT NULL CHECK (main_category = ANY (ARRAY['documents'::text, 'videos'::text, 'audios'::text, 'visuals'::text, 'others'::text]::text[])),
  sub_category text NOT NULL,
  url text NOT NULL,
  cefr_level text NOT NULL CHECK (cefr_level = ANY (ARRAY['A1'::text, 'A2'::text, 'B1'::text, 'B2'::text, 'C1'::text, 'C2'::text, 'All Levels'::text]::text[])),
  tags text[] NOT NULL DEFAULT '{}'::text[],
  allow_student_download boolean NOT NULL DEFAULT true,
  CONSTRAINT resource_assets_pkey PRIMARY KEY (id),
  CONSTRAINT resource_assets_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.users(id)
);