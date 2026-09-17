-- Published lessons must be visible to their student assignment, including
-- lessons marked for all active students. Instructor ownership remains valid.
DROP POLICY IF EXISTS "Users can view their own lessons" ON lessons;
CREATE POLICY "Users can view assigned published lessons" ON lessons
FOR SELECT
USING (
  auth.uid() = student_id
  OR auth.uid() = instructor_id
  OR (
    status = 'published'
    AND assigned_all_students = true
    AND EXISTS (SELECT 1 FROM students WHERE students.id = auth.uid())
  )
  OR (
    status = 'published'
    AND EXISTS (
      SELECT 1
      FROM lesson_assignments
      WHERE lesson_assignments.lesson_id = lessons.id
        AND lesson_assignments.student_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "Users can update their own lessons" ON lessons;
CREATE POLICY "Instructors can update lessons" ON lessons
FOR UPDATE
USING (
  auth.uid() = instructor_id
  OR EXISTS (SELECT 1 FROM instructors WHERE instructors.id = auth.uid())
  OR auth.uid() = student_id
)
WITH CHECK (
  auth.uid() = instructor_id
  OR EXISTS (SELECT 1 FROM instructors WHERE instructors.id = auth.uid())
  OR auth.uid() = student_id
);

DROP POLICY IF EXISTS "Users can delete their own lessons" ON lessons;
CREATE POLICY "Instructors can delete lessons" ON lessons
FOR DELETE
USING (
  auth.uid() = instructor_id
  OR EXISTS (SELECT 1 FROM instructors WHERE instructors.id = auth.uid())
);

DROP POLICY IF EXISTS "Users can view lesson versions" ON lesson_versions;
DROP POLICY IF EXISTS "Users can create lesson versions" ON lesson_versions;
CREATE POLICY "Participants can manage lesson versions" ON lesson_versions
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM lessons
    WHERE lessons.id = lesson_versions.lesson_id
      AND (
        lessons.student_id = auth.uid()
        OR lessons.instructor_id = auth.uid()
        OR EXISTS (SELECT 1 FROM instructors WHERE instructors.id = auth.uid())
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM lessons
    WHERE lessons.id = lesson_versions.lesson_id
      AND (
        lessons.student_id = auth.uid()
        OR lessons.instructor_id = auth.uid()
        OR EXISTS (SELECT 1 FROM instructors WHERE instructors.id = auth.uid())
      )
  )
);

DROP POLICY IF EXISTS "Users can view lesson versions" ON lesson_versions;
CREATE POLICY "Users can view assigned lesson versions" ON lesson_versions
FOR SELECT
USING (EXISTS (SELECT 1 FROM lessons WHERE lessons.id = lesson_versions.lesson_id));