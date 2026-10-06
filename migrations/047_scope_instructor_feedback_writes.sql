ALTER TABLE public.instructor_feedback
  ADD COLUMN IF NOT EXISTS instructor_id uuid;

UPDATE public.instructor_feedback AS feedback
SET instructor_id = lessons.instructor_id::uuid
FROM public.lessons AS lessons
WHERE lessons.id::text = feedback.lesson_id::text
  AND feedback.instructor_id IS DISTINCT FROM lessons.instructor_id::uuid;

DROP POLICY IF EXISTS "Feedback writable by instructors" ON public.instructor_feedback;
DROP POLICY IF EXISTS "Instructors can read feedback for their lessons" ON public.instructor_feedback;
DROP POLICY IF EXISTS "Instructors can insert draft feedback" ON public.instructor_feedback;
DROP POLICY IF EXISTS "Instructors can update their own draft feedback" ON public.instructor_feedback;

CREATE POLICY "Instructors can read feedback for their lessons"
ON public.instructor_feedback
FOR SELECT
TO authenticated
USING (
  auth.uid()::uuid = instructor_feedback.instructor_id::uuid
  AND EXISTS (
    SELECT 1
    FROM public.lessons
    WHERE lessons.id::text = instructor_feedback.lesson_id::text
      AND lessons.instructor_id::uuid = auth.uid()::uuid
  )
);

CREATE POLICY "Instructors can insert draft feedback"
ON public.instructor_feedback
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid()::uuid = instructor_feedback.instructor_id::uuid
  AND EXISTS (
    SELECT 1
    FROM public.lessons
    WHERE lessons.id::text = instructor_feedback.lesson_id::text
      AND lessons.instructor_id::uuid = auth.uid()::uuid
  )
);

CREATE POLICY "Instructors can update their own draft feedback"
ON public.instructor_feedback
FOR UPDATE
TO authenticated
USING (
  auth.uid()::uuid = instructor_feedback.instructor_id::uuid
  AND EXISTS (
    SELECT 1
    FROM public.lessons
    WHERE lessons.id::text = instructor_feedback.lesson_id::text
      AND lessons.instructor_id::uuid = auth.uid()::uuid
  )
)
WITH CHECK (
  auth.uid()::uuid = instructor_feedback.instructor_id::uuid
  AND EXISTS (
    SELECT 1
    FROM public.lessons
    WHERE lessons.id::text = instructor_feedback.lesson_id::text
      AND lessons.instructor_id::uuid = auth.uid()::uuid
  )
);

NOTIFY pgrst, 'reload schema';
