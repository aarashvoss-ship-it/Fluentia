ALTER TABLE public.resource_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Instructors manage their own resource assets" ON public.resource_assets;
DROP POLICY IF EXISTS "Instructors read their own resource assets" ON public.resource_assets;
DROP POLICY IF EXISTS "Instructors insert their own resource assets" ON public.resource_assets;
DROP POLICY IF EXISTS "Instructors update their own resource assets" ON public.resource_assets;
DROP POLICY IF EXISTS "Instructors delete their own resource assets" ON public.resource_assets;

CREATE POLICY "Instructors read their own resource assets"
  ON public.resource_assets
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = instructor_id
    AND (
      EXISTS (
        SELECT 1
        FROM public.instructors
        WHERE instructors.id = auth.uid()
      )
      OR EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE profiles.id = auth.uid()
          AND profiles.role IN ('instructor', 'admin')
      )
    )
  );

CREATE POLICY "Instructors insert their own resource assets"
  ON public.resource_assets
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = instructor_id
    AND (
      EXISTS (
        SELECT 1
        FROM public.instructors
        WHERE instructors.id = auth.uid()
      )
      OR EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE profiles.id = auth.uid()
          AND profiles.role IN ('instructor', 'admin')
      )
    )
  );

CREATE POLICY "Instructors update their own resource assets"
  ON public.resource_assets
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = instructor_id
    AND (
      EXISTS (
        SELECT 1
        FROM public.instructors
        WHERE instructors.id = auth.uid()
      )
      OR EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE profiles.id = auth.uid()
          AND profiles.role IN ('instructor', 'admin')
      )
    )
  )
  WITH CHECK (
    auth.uid() = instructor_id
    AND (
      EXISTS (
        SELECT 1
        FROM public.instructors
        WHERE instructors.id = auth.uid()
      )
      OR EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE profiles.id = auth.uid()
          AND profiles.role IN ('instructor', 'admin')
      )
    )
  );

CREATE POLICY "Instructors delete their own resource assets"
  ON public.resource_assets
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() = instructor_id
    AND (
      EXISTS (
        SELECT 1
        FROM public.instructors
        WHERE instructors.id = auth.uid()
      )
      OR EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE profiles.id = auth.uid()
          AND profiles.role IN ('instructor', 'admin')
      )
    )
  );

NOTIFY pgrst, 'reload schema';
