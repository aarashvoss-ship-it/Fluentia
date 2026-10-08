ALTER TABLE public.student_resources
  DROP CONSTRAINT IF EXISTS student_resources_resource_type_check;

ALTER TABLE public.student_resources
  ADD CONSTRAINT student_resources_resource_type_check
  CHECK (resource_type IN ('note', 'reading', 'flashcard', 'flashcards', 'quiz', 'audio', 'data_table', 'file', 'image', 'video'));

ALTER TABLE public.student_resources
  ADD COLUMN IF NOT EXISTS storage_path text,
  ADD COLUMN IF NOT EXISTS is_external_url boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_student_resources_lesson_type_created
  ON public.student_resources(lesson_id, resource_type, created_at DESC);

NOTIFY pgrst, 'reload schema';
