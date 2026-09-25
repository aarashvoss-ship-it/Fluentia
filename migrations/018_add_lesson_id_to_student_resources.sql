ALTER TABLE student_resources
  ADD COLUMN IF NOT EXISTS lesson_id uuid REFERENCES lessons(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_student_resources_student_lesson_created
  ON student_resources(student_id, lesson_id, created_at DESC);
