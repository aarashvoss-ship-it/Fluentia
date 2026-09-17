# Fluential - Project Architecture Context

## Core Identity & Authentication Model
- **Primary Source of Truth**: Supabase `auth.users`, along with `public.profiles` and `public.students` tables.
- **Identity Key**: All student identification, assignments, and storage paths MUST strictly use Supabase `auth.uid()` (UUID format).
- **Deprecated Systems**: Hardcoded `FLUENTIA_USERS` / token-based identity logic in `lib/users.ts` is deprecated for DB lookups. No legacy token fallbacks should be introduced.

## Database Schema Overview
- `auth.users`: Managed by Supabase Auth.
- `public.profiles`: Stores extended user data (`id` references `auth.users.id`, `full_name`, `role`).
- `public.students`: Stores student-specific view/records (`id` references `profiles.id`, `name`).
- `public.lesson_assignments`: Maps published lessons to students via `student_id` (UUID).

## Current Project Status
- Identity refactor to UUIDs is complete across authentication flows and basic dashboard displays.
- `students` and `profiles` tables have been synchronized with the registered user base.
- Student lesson visibility relies on active assignments mapped directly to `student_id` (UUID).

## Working Guidelines for Claude
1. Always maintain strict TypeScript type checks (`npm run build`).
2. Never revert back to legacy string tokens (e.g. `arash-1024`) for database relationships or local lookups.
3. Keep database queries targeted to Supabase client methods with proper RLS awareness.