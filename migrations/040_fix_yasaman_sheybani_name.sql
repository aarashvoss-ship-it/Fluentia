UPDATE profiles
SET full_name = 'Yasaman Sheybani',
    updated_at = now()
WHERE role = 'student'
  AND (
    lower(trim(email)) = 'yasamansheybani7192@gmail.com'
    OR lower(trim(full_name)) = 'yasaman shebani'
  );

UPDATE students
SET name = 'Yasaman Sheybani',
    updated_at = now()
WHERE lower(trim(email)) = 'yasamansheybani7192@gmail.com'
   OR lower(trim(name)) = 'yasaman shebani';