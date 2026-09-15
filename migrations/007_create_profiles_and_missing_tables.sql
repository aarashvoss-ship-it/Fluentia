-- Phase 1 identity and missing application tables
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  token text UNIQUE NOT NULL,
  full_name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'instructor', 'admin')),
  level text,
  target_goal text,
  avatar_url text,
  banner_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_token ON profiles(token);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

CREATE TABLE IF NOT EXISTS user_vocab (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  word text NOT NULL,
  part_of_speech text,
  definition text NOT NULL,
  example text,
  pronunciation_url text,
  source text,
  saved_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, word)
);

CREATE TABLE IF NOT EXISTS user_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  text text NOT NULL,
  lesson_slug text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS instructor_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  comments text,
  strengths text,
  areas_to_improve text,
  study_hub_prescription text,
  voice_feedback_url text,
  is_published boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(lesson_id, student_id)
);

CREATE TABLE IF NOT EXISTS lesson_assignments (
  lesson_id uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lesson_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_user_vocab_user_id ON user_vocab(user_id);
CREATE INDEX IF NOT EXISTS idx_user_notes_user_id ON user_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_student_lesson ON instructor_feedback(student_id, lesson_id);
CREATE INDEX IF NOT EXISTS idx_assignments_student ON lesson_assignments(student_id);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_vocab ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE instructor_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profiles readable by token or owner" ON profiles;
DROP POLICY IF EXISTS "Profiles writable by token or owner" ON profiles;
DROP POLICY IF EXISTS "Profiles readable by owner" ON profiles;
DROP POLICY IF EXISTS "Profiles writable by owner" ON profiles;
CREATE POLICY "Profiles readable by owner" ON profiles FOR SELECT
USING (auth.uid() = id);

CREATE POLICY "Profiles writable by owner" ON profiles FOR ALL
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Vocabulary owned by profile" ON user_vocab;
CREATE POLICY "Vocabulary owned by profile" ON user_vocab FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Notes owned by profile" ON user_notes;
CREATE POLICY "Notes owned by profile" ON user_notes FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Feedback readable by participants" ON instructor_feedback;
CREATE POLICY "Feedback readable by participants" ON instructor_feedback FOR SELECT
USING (auth.uid() = student_id OR auth.uid() = (SELECT instructor_id FROM lessons WHERE lessons.id = instructor_feedback.lesson_id));

DROP POLICY IF EXISTS "Feedback writable by instructors" ON instructor_feedback;
CREATE POLICY "Feedback writable by instructors" ON instructor_feedback FOR ALL
USING (auth.uid() = (SELECT instructor_id FROM lessons WHERE lessons.id = instructor_feedback.lesson_id))
WITH CHECK (auth.uid() = (SELECT instructor_id FROM lessons WHERE lessons.id = instructor_feedback.lesson_id));

DROP POLICY IF EXISTS "Assignments readable by participants" ON lesson_assignments;
CREATE POLICY "Assignments readable by participants" ON lesson_assignments FOR SELECT
USING (auth.uid() = student_id OR auth.uid() = (SELECT instructor_id FROM lessons WHERE lessons.id = lesson_assignments.lesson_id));

DROP POLICY IF EXISTS "Assignments writable by instructors" ON lesson_assignments;
CREATE POLICY "Assignments writable by instructors" ON lesson_assignments FOR ALL
USING (auth.uid() = (SELECT instructor_id FROM lessons WHERE lessons.id = lesson_assignments.lesson_id))
WITH CHECK (auth.uid() = (SELECT instructor_id FROM lessons WHERE lessons.id = lesson_assignments.lesson_id));
