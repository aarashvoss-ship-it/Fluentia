CREATE TABLE IF NOT EXISTS public.academis_prompt_libraries (
  instructor_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  library jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
