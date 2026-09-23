ALTER TABLE student_profiles
  ADD COLUMN IF NOT EXISTS assigned_instructor text NOT NULL DEFAULT '';