-- The instructor workstation intentionally loads the complete lesson library.
-- Older lessons may not have instructor_id populated, so grant this read path
-- only to authenticated users represented in the instructors table.
DROP POLICY IF EXISTS "Registered instructors can read lesson library" ON lessons;
CREATE POLICY "Registered instructors can read lesson library" ON lessons
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.instructors
    WHERE instructors.id = auth.uid()
  )
);

-- Keep legacy student-token assignments visible only to their canonical student.
DROP POLICY IF EXISTS "Students can read published token-assigned lessons" ON lessons;
CREATE POLICY "Students can read published token-assigned lessons" ON lessons
FOR SELECT
USING (
  status = 'published'
  AND EXISTS (
    SELECT 1
    FROM public.students
    WHERE students.id = auth.uid()
      AND students.token = lessons.student_token
  )
);
