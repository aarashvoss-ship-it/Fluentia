ALTER TABLE submissions
  DROP CONSTRAINT IF EXISTS submissions_status_check;

ALTER TABLE submissions
  ADD CONSTRAINT submissions_status_check
  CHECK (status IN ('draft', 'not_started', 'in_progress', 'submitted', 'pending_evaluation', 'completed', 'reviewed', 'evaluated'));

ALTER TABLE instructor_feedback
  ADD COLUMN IF NOT EXISTS criterion_feedback jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE instructor_feedback
  ADD COLUMN IF NOT EXISTS total_score integer NOT NULL DEFAULT 0;
