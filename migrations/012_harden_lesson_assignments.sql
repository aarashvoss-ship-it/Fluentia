-- Canonical assignment state for authenticated student lesson access.
ALTER TABLE lesson_assignments
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'assigned';

UPDATE lesson_assignments
SET status = 'assigned'
WHERE status IS NULL;

CREATE INDEX IF NOT EXISTS idx_lesson_assignments_student_status
  ON lesson_assignments(student_id, status);

ALTER TABLE lesson_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students can read their assignments" ON lesson_assignments;
CREATE POLICY "Students can read their assignments" ON lesson_assignments
FOR SELECT
USING (auth.uid() = student_id);

DROP POLICY IF EXISTS "Instructors can manage lesson assignments" ON lesson_assignments;
CREATE POLICY "Instructors can manage lesson assignments" ON lesson_assignments
FOR ALL
USING (
  auth.uid() = (SELECT instructor_id FROM lessons WHERE lessons.id = lesson_assignments.lesson_id)
  OR EXISTS (SELECT 1 FROM instructors WHERE instructors.id = auth.uid())
)
WITH CHECK (
  auth.uid() = (SELECT instructor_id FROM lessons WHERE lessons.id = lesson_assignments.lesson_id)
  OR EXISTS (SELECT 1 FROM instructors WHERE instructors.id = auth.uid())
);

DROP POLICY IF EXISTS "Students can read assigned published lessons" ON lessons;
CREATE POLICY "Students can read assigned published lessons" ON lessons
FOR SELECT
USING (
  status = 'published'
  AND EXISTS (
    SELECT 1
    FROM lesson_assignments
    WHERE lesson_assignments.lesson_id = lessons.id
      AND lesson_assignments.student_id = auth.uid()
      AND lesson_assignments.status = 'assigned'
  )
);
