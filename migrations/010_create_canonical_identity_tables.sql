-- Canonical identity tables used by the application runtime.
CREATE TABLE IF NOT EXISTS allowed_users (
  email text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS students (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text UNIQUE NOT NULL,
  token text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS instructors (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text UNIQUE NOT NULL,
  slug text UNIQUE NOT NULL,
  token text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS waitlist (
  email text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE allowed_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE instructors ENABLE ROW LEVEL SECURITY;
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read allowed users" ON allowed_users;
CREATE POLICY "Authenticated users can read allowed users" ON allowed_users FOR SELECT
USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can read students" ON students;
CREATE POLICY "Authenticated users can read students" ON students FOR SELECT
USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Students can update their own record" ON students;
CREATE POLICY "Students can update their own record" ON students FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Authenticated users can read instructors" ON instructors;
CREATE POLICY "Authenticated users can read instructors" ON instructors FOR SELECT
USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Anyone can join the waitlist" ON waitlist;
CREATE POLICY "Anyone can join the waitlist" ON waitlist FOR INSERT
WITH CHECK (true);

-- Assignment rows reference the canonical student identity, not legacy profiles.
DO $$
BEGIN
  IF to_regclass('public.lesson_assignments') IS NOT NULL THEN
    ALTER TABLE lesson_assignments DROP CONSTRAINT IF EXISTS lesson_assignments_student_id_fkey;
    ALTER TABLE lesson_assignments
      ADD CONSTRAINT lesson_assignments_student_id_fkey
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;
  END IF;
END $$;