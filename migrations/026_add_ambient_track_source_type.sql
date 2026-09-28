ALTER TABLE public.ambient_tracks
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'url';

ALTER TABLE public.ambient_tracks
  DROP CONSTRAINT IF EXISTS ambient_tracks_source_type_check;

ALTER TABLE public.ambient_tracks
  ADD CONSTRAINT ambient_tracks_source_type_check
  CHECK (source_type IN ('upload', 'url'));

NOTIFY pgrst, 'reload schema';