ALTER TABLE submissions
  DROP CONSTRAINT IF EXISTS submissions_status_check;

UPDATE submissions
SET status = 'pending_evaluation'
WHERE status IS NOT NULL
  AND status NOT IN ('draft', 'not_started', 'in_progress', 'submitted', 'pending_evaluation', 'completed', 'reviewed');

ALTER TABLE submissions
  ALTER COLUMN status SET DEFAULT 'in_progress';

ALTER TABLE submissions
  ADD CONSTRAINT submissions_status_check
  CHECK (status IN ('draft', 'not_started', 'in_progress', 'submitted', 'pending_evaluation', 'completed', 'reviewed'));