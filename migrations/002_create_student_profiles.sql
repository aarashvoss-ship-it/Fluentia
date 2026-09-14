CREATE TABLE IF NOT EXISTS student_profiles (
  student_token text PRIMARY KEY,
  level text NOT NULL DEFAULT 'B1',
  learning_goal text NOT NULL DEFAULT '',
  instructor_notes text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE student_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow student profile reads"
  ON student_profiles
  FOR SELECT
  USING (true);

CREATE POLICY "Allow student profile writes"
  ON student_profiles
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow student profile updates"
  ON student_profiles
  FOR UPDATE
  USING (true)
  WITH CHECK (true);