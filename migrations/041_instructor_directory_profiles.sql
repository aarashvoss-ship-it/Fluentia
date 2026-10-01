ALTER TABLE instructors
  ADD COLUMN IF NOT EXISTS specialization text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS max_student_capacity integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS bio text NOT NULL DEFAULT '';

ALTER TABLE instructors
  ADD CONSTRAINT instructors_status_check
  CHECK (status IN ('active', 'on_leave'));