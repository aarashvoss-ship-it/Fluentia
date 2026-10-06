CREATE UNIQUE INDEX IF NOT EXISTS instructor_feedback_lesson_student_unique_idx
  ON public.instructor_feedback (lesson_id, student_id);

NOTIFY pgrst, 'reload schema';
