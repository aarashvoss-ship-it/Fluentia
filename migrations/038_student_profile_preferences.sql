ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS focus_weaknesses jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS assigned_instructor text,
  ADD COLUMN IF NOT EXISTS dashboard_note text;

UPDATE profiles AS profile
SET focus_weaknesses = COALESCE(profile.focus_weaknesses, '[]'::jsonb),
    assigned_instructor = COALESCE(profile.assigned_instructor, legacy.assigned_instructor),
    dashboard_note = COALESCE(profile.dashboard_note, legacy.instructor_notes, profile.instructor_note)
FROM students AS student
LEFT JOIN student_profiles AS legacy ON legacy.student_token = student.token
WHERE profile.id = student.id
  AND profile.role = 'student';

UPDATE profiles
SET focus_weaknesses = COALESCE(focus_weaknesses, '[]'::jsonb),
    dashboard_note = COALESCE(dashboard_note, instructor_note)
WHERE role = 'student';
