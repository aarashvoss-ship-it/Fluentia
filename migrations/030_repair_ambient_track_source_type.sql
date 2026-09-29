ALTER TABLE public.ambient_tracks
  ADD COLUMN IF NOT EXISTS source_type text;

ALTER TABLE public.ambient_tracks
  DROP CONSTRAINT IF EXISTS ambient_tracks_source_type_check;

ALTER TABLE public.ambient_tracks
  ALTER COLUMN source_type SET DEFAULT 'url';

UPDATE public.ambient_tracks
SET source_type = 'url'
WHERE source_type IS NULL OR source_type = 'stream';

ALTER TABLE public.ambient_tracks
  ALTER COLUMN source_type SET NOT NULL;

ALTER TABLE public.ambient_tracks
  ADD CONSTRAINT ambient_tracks_source_type_check
  CHECK (source_type IN ('upload', 'url', 'youtube'));

NOTIFY pgrst, 'reload schema';