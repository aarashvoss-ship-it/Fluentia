ALTER TABLE lessons
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS subtitle text,
  ADD COLUMN IF NOT EXISTS module_number integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS banner_url text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_lessons_slug ON lessons(slug) WHERE slug IS NOT NULL;
