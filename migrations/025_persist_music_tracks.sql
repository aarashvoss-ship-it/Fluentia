ALTER TABLE public.ambient_tracks ENABLE ROW LEVEL SECURITY;

INSERT INTO public.ambient_tracks (title, url, sort_order, is_active)
VALUES
  ('Deep Focus (Lofi)', 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3', 1, true),
  ('Gentle Rain & Piano', 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3', 2, true),
  ('Calm Ambient Synth', 'https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3', 3, true),
  ('Alpha Waves', 'https://cdn.pixabay.com/download/audio/2021/09/06/audio_84e1d13f98.mp3', 4, true)
ON CONFLICT (url) DO UPDATE SET
  title = EXCLUDED.title,
  sort_order = EXCLUDED.sort_order,
  is_active = true;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ambient-music',
  'ambient-music',
  true,
  15728640,
  ARRAY['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/aac', 'audio/x-m4a']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Ambient tracks are publicly readable" ON public.ambient_tracks;
CREATE POLICY "Ambient tracks are publicly readable"
  ON public.ambient_tracks FOR SELECT
  USING (
    is_active = true
    OR EXISTS (SELECT 1 FROM public.instructors WHERE instructors.id = auth.uid())
  );

DROP POLICY IF EXISTS "Instructor can manage ambient tracks" ON public.ambient_tracks;
CREATE POLICY "Instructor can manage ambient tracks"
  ON public.ambient_tracks FOR ALL
  USING (EXISTS (SELECT 1 FROM public.instructors WHERE instructors.id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.instructors WHERE instructors.id = auth.uid()));

DROP POLICY IF EXISTS "Ambient music files are publicly readable" ON storage.objects;
CREATE POLICY "Ambient music files are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'ambient-music');

DROP POLICY IF EXISTS "Ambient music files can be uploaded" ON storage.objects;
DROP POLICY IF EXISTS "Instructors can upload ambient music files" ON storage.objects;
CREATE POLICY "Instructors can upload ambient music files"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'ambient-music'
    AND EXISTS (SELECT 1 FROM public.instructors WHERE instructors.id = auth.uid())
  );

DROP POLICY IF EXISTS "Ambient music files can be removed" ON storage.objects;
DROP POLICY IF EXISTS "Instructors can delete ambient music files" ON storage.objects;
CREATE POLICY "Instructors can delete ambient music files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'ambient-music'
    AND EXISTS (SELECT 1 FROM public.instructors WHERE instructors.id = auth.uid())
  );

NOTIFY pgrst, 'reload schema';