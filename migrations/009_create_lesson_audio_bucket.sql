INSERT INTO storage.buckets (id, name, public)
VALUES ('lesson-audio', 'lesson-audio', true)
ON CONFLICT (id) DO UPDATE SET public = true;

CREATE POLICY "Lesson audio files are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'lesson-audio');

CREATE POLICY "Lesson audio files can be uploaded"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'lesson-audio');
