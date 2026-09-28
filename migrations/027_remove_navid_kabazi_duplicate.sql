-- Remove only the verified misspelled student identity; preserve any identity with submissions.
DO $$
DECLARE
  target_student_id uuid := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12';
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.submissions
    WHERE student_id = target_student_id
  ) THEN
    RAISE EXCEPTION 'Refusing to remove Navid Kabazi while submissions are linked to the record';
  END IF;

  DELETE FROM public.students
  WHERE id = target_student_id
    AND name = 'Navid Kabazi';

  DELETE FROM public.profiles
  WHERE id = target_student_id
    AND full_name = 'Navid Kabazi';
END $$;

NOTIFY pgrst, 'reload schema';