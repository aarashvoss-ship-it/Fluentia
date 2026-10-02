-- Restore lesson tag storage on deployments that missed migration 024.
ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS tags jsonb NOT NULL DEFAULT '{}'::jsonb;

NOTIFY pgrst, 'reload schema';
