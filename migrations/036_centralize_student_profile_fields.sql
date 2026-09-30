ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS target_level text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS enrolled_date date;

UPDATE profiles
SET target_level = COALESCE(target_level, level),
    enrolled_date = COALESCE(enrolled_date, created_at::date)
WHERE role = 'student';

UPDATE profiles AS profile
SET email = COALESCE(profile.email, student.email)
FROM students AS student
WHERE profile.id = student.id
  AND profile.role = 'student';

ALTER TABLE profiles
  ALTER COLUMN enrolled_date SET DEFAULT current_date;

UPDATE profiles
SET enrolled_date = COALESCE(enrolled_date, created_at::date, current_date)
WHERE enrolled_date IS NULL;

ALTER TABLE profiles
  ALTER COLUMN enrolled_date SET NOT NULL;

DROP POLICY IF EXISTS "Instructors can update student profiles" ON profiles;
CREATE POLICY "Instructors can update student profiles" ON profiles FOR UPDATE TO authenticated
USING (
  role = 'student'
  AND EXISTS (SELECT 1 FROM instructors WHERE instructors.id = auth.uid())
)
WITH CHECK (role = 'student');
