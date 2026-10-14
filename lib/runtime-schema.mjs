export const RUNTIME_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  password_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS password_hash text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_key
  ON public.users (lower(email))
  WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY,
  token text UNIQUE NOT NULL,
  full_name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'student'
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS token text,
  ADD COLUMN IF NOT EXISTS full_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'student';

CREATE TABLE IF NOT EXISTS public.instructors (
  id uuid PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS public.allowed_users (
  email text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.waitlist_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS waitlist_requests_email_lower_key
  ON public.waitlist_requests (lower(email));
`;
