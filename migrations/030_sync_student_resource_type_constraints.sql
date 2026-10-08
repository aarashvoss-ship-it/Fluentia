DO $$
DECLARE
  constraint_row record;
BEGIN
  FOR constraint_row IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.student_resources'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ~* '\m(resource_type|type)\M'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.student_resources DROP CONSTRAINT %I',
      constraint_row.conname
    );
  END LOOP;
END;
$$;

ALTER TABLE public.student_resources
  ADD CONSTRAINT student_resources_supported_types_check
  CHECK (
    resource_type IN ('note', 'reading', 'flashcard', 'flashcards', 'quiz', 'audio', 'data_table', 'file', 'image', 'video')
    AND type IN ('note', 'reading', 'flashcard', 'flashcards', 'quiz', 'audio', 'data_table', 'file', 'image', 'video')
    AND type = resource_type
  ) NOT VALID;

NOTIFY pgrst, 'reload schema';
