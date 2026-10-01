ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS core_goal text;

UPDATE profiles
SET core_goal = COALESCE(core_goal, target_goal),
    target_goal = COALESCE(target_goal, core_goal)
WHERE role = 'student';