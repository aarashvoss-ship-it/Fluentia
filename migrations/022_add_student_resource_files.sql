ALTER TABLE student_resources
  DROP CONSTRAINT IF EXISTS student_resources_resource_type_check;

ALTER TABLE student_resources
  ADD CONSTRAINT student_resources_resource_type_check
  CHECK (resource_type IN ('note', 'reading', 'flashcard', 'quiz', 'audio', 'data_table', 'file'));

ALTER TABLE student_resources
  ADD COLUMN IF NOT EXISTS original_filename text,
  ADD COLUMN IF NOT EXISTS media_type text;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'student-resources',
  'student-resources',
  true,
  52428800,
  ARRAY[
    'image/png', 'image/jpeg', 'image/webp', 'image/gif',
    'text/plain', 'text/markdown', 'text/csv',
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/rtf', 'application/vnd.oasis.opendocument.text',
    'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/mp4',
    'audio/aac', 'audio/flac', 'audio/webm',
    'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 52428800,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Student resource files are publicly readable" ON storage.objects;
CREATE POLICY "Student resource files are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'student-resources');

DROP POLICY IF EXISTS "Authenticated users can upload student resource files" ON storage.objects;
CREATE POLICY "Authenticated users can upload student resource files"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'student-resources' AND auth.role() = 'authenticated');

NOTIFY pgrst, 'reload schema';
