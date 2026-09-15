CREATE TABLE IF NOT EXISTS ambient_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  url text NOT NULL UNIQUE,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ambient_tracks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ambient tracks are publicly readable"
  ON ambient_tracks FOR SELECT
  USING (is_active = true);

CREATE POLICY "Instructor can manage ambient tracks"
  ON ambient_tracks FOR ALL
  USING (true)
  WITH CHECK (true);

INSERT INTO ambient_tracks (title, url, sort_order)
VALUES
  ('Deep Focus (Lofi)', 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3', 1),
  ('Gentle Rain & Piano', 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3', 2),
  ('Calm Ambient Synth', 'https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3', 3),
  ('Alpha Waves', 'https://cdn.pixabay.com/download/audio/2021/09/06/audio_84e1d13f98.mp3', 4)
ON CONFLICT (url) DO UPDATE SET
  title = EXCLUDED.title,
  sort_order = EXCLUDED.sort_order,
  is_active = true;

INSERT INTO storage.buckets (id, name, public)
VALUES ('ambient-music', 'ambient-music', true)
ON CONFLICT (id) DO UPDATE SET public = true;

CREATE POLICY "Ambient music files are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'ambient-music');

CREATE POLICY "Ambient music files can be uploaded"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'ambient-music');

CREATE POLICY "Ambient music files can be removed"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'ambient-music');