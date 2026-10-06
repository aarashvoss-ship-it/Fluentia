ALTER TABLE public.instructor_feedback
  ADD COLUMN IF NOT EXISTS instructor_id uuid;

UPDATE public.instructor_feedback AS feedback
SET instructor_id = lessons.instructor_id
FROM public.lessons AS lessons
WHERE lessons.id = feedback.lesson_id
  AND feedback.instructor_id IS DISTINCT FROM lessons.instructor_id;

DROP POLICY IF EXISTS "Feedback writable by instructors" ON public.instructor_feedback;
DROP POLICY IF EXISTS "Instructors can read feedback for their lessons" ON public.instructor_feedback;
DROP POLICY IF EXISTS "Instructors can insert draft feedback" ON public.instructor_feedback;
DROP POLICY IF EXISTS "Instructors can update their own draft feedback" ON public.instructor_feedback;

CREATE POLICY "Instructors can read feedback for their lessons"
ON public.instructor_feedback
FOR SELECT
TO authenticated
USING (
  auth.uid() = instructor_id
  AND EXISTS (
    SELECT 1
    FROM public.lessons
    WHERE lessons.id = instructor_feedback.lesson_id
      AND lessons.instructor_id = auth.uid()
  )
);

CREATE POLICY "Instructors can insert draft feedback"
ON public.instructor_feedback
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = instructor_id
  AND EXISTS (
    SELECT 1
    FROM public.lessons
    WHERE lessons.id = instructor_feedback.lesson_id
      AND lessons.instructor_id = auth.uid()
  )
);

CREATE POLICY "Instructors can update their own draft feedback"
ON public.instructor_feedback
FOR UPDATE
TO authenticated
USING (
  auth.uid() = instructor_id
  AND EXISTS (
    SELECT 1
    FROM public.lessons
    WHERE lessons.id = instructor_feedback.lesson_id
      AND lessons.instructor_id = auth.uid()
  )
)
WITH CHECK (
  auth.uid() = instructor_id
  AND EXISTS (
    SELECT 1
    FROM public.lessons
    WHERE lessons.id = instructor_feedback.lesson_id
      AND lessons.instructor_id = auth.uid()
  )
);

NOTIFY pgrst, 'reload schema';
