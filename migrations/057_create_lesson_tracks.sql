CREATE TABLE IF NOT EXISTS public.lesson_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS lesson_tracks_instructor_name_lower_key
  ON public.lesson_tracks (instructor_id, lower(name));

ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS track_id uuid REFERENCES public.lesson_tracks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS lessons_track_active_idx
  ON public.lessons (track_id, is_archived, created_at DESC);
