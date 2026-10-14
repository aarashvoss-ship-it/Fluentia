# Fluential - Project Architecture Context

## Core Identity & Authentication Model
- **Native account source of truth**: Paasta `public.users` stores email and bcrypt password hashes; `public.profiles` stores application roles.
- **Session identity**: Native sign-in issues an HttpOnly, signed JWT cookie verified by Next.js middleware and server routes.
- **Migration status**: Supabase remains in use for application data and storage. Existing Supabase RLS policies still depend on `auth.uid()` and do not automatically recognize native JWT sessions.
- **Deprecated Systems**: Hardcoded `FLUENTIA_USERS` / token-based identity logic in `lib/users.ts` is deprecated for DB lookups. No legacy token fallbacks should be introduced.

## Database Schema Overview
- `public.users`: Native account ID, email, password hash, and creation time.
- `public.profiles`: Stores extended user data (`id`, `full_name`, `role`).
- `public.students`: Stores student-specific view/records (`id` references `profiles.id`, `name`).
- `public.lesson_assignments`: Maps published lessons to students via `student_id` (UUID).

## Current Project Status
- Native password sign-in, invitation-only sign-up, and JWT-cookie route protection are implemented.
- Supabase-backed data/storage and some administrative account-provisioning calls remain; replacing these is a separate migration.
- Existing accounts without a native password hash need verified onboarding before native sign-in.
- Student lesson visibility relies on active assignments mapped directly to `student_id` (UUID).

## Working Guidelines for Claude
1. Always maintain strict TypeScript type checks (`npm run build`).
2. Never revert back to legacy string tokens (e.g. `arash-1024`) for database relationships or local lookups.
3. Keep remaining Supabase data queries targeted and account for the fact that native cookies do not satisfy Supabase RLS.