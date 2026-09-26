INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('lesson-assets', 'lesson-assets', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp'];

DROP POLICY IF EXISTS "Lesson assets are publicly readable" ON storage.objects;
CREATE POLICY "Lesson assets are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'lesson-assets');

DROP POLICY IF EXISTS "Authenticated users can upload lesson assets" ON storage.objects;
CREATE POLICY "Authenticated users can upload lesson assets"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'lesson-assets' AND auth.role() = 'authenticated');
