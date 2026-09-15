ALTER TABLE lessons
  ADD COLUMN IF NOT EXISTS student_token text;

CREATE INDEX IF NOT EXISTS idx_lessons_student_token
  ON lessons(student_token);