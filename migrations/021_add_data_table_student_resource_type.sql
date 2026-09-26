ALTER TABLE student_resources
  DROP CONSTRAINT IF EXISTS student_resources_resource_type_check;

ALTER TABLE student_resources
  ADD CONSTRAINT student_resources_resource_type_check
  CHECK (resource_type IN ('note', 'reading', 'flashcard', 'quiz', 'audio', 'data_table'));

NOTIFY pgrst, 'reload schema';
