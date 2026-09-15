ALTER TABLE lessons
  ADD COLUMN IF NOT EXISTS assigned_all_students boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_lessons_assigned_all_students
  ON lessons(assigned_all_students)
  WHERE assigned_all_students = true;
