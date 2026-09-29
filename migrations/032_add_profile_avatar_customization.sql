ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS avatar_bg_color text,
  ADD COLUMN IF NOT EXISTS avatar_initials text;
