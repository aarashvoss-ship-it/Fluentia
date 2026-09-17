-- Keep the explicit publish flag synchronized with lessons.status.
ALTER TABLE lessons
  ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT false;

UPDATE lessons
SET is_published = (status = 'published');

CREATE INDEX IF NOT EXISTS idx_lessons_is_published
  ON lessons(is_published)
  WHERE is_published = true;
