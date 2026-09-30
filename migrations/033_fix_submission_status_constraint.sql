UPDATE submissions
SET status = 'pending_evaluation'
WHERE status IS NOT NULL
  AND status NOT IN ('not_started', 'in_progress', 'submitted', 'pending_evaluation', 'reviewed');

ALTER TABLE submissions
  ALTER COLUMN status SET DEFAULT 'in_progress';

ALTER TABLE submissions
  DROP CONSTRAINT IF EXISTS submissions_status_check;

ALTER TABLE submissions
  ADD CONSTRAINT submissions_status_check
  CHECK (status IN ('not_started', 'in_progress', 'submitted', 'pending_evaluation', 'reviewed'));