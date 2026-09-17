# Fluentia AI Agent Guide

## Purpose
This repository is a Next.js 15 application for a private learning platform with instructor/student flows, lesson authoring, submissions, evaluations, banners, and Supabase-backed persistence.

Use this file as the short, project-specific source of truth. For deeper context, read the docs linked below before making broader changes.

## Key Documents
- [README_SESSION_COMPLETE.md](README_SESSION_COMPLETE.md)
- [SETUP_GUIDE.md](SETUP_GUIDE.md)
- [INTEGRATION_GUIDE.md](INTEGRATION_GUIDE.md)
- [FINAL_STATUS_REPORT.md](FINAL_STATUS_REPORT.md)
- [API_QUICK_REFERENCE.md](API_QUICK_REFERENCE.md)
- [SUBMISSIONS_EVALUATIONS_GUIDE.md](SUBMISSIONS_EVALUATIONS_GUIDE.md)

## Project Structure
- `app/` — App Router pages and route groups.
- `components/` — reusable UI, including instructor and study-room features.
- `lib/` — domain logic and database access helpers.
- `services/` — storage or platform service wrappers.
- `migrations/` — SQL migrations for Supabase schema changes.
- `types/` — TypeScript definitions.
- `public/` — static assets.

## Stack and Runtime
- Next.js 15 with the App Router.
- React 19.
- Tailwind CSS.
- Supabase for auth, database, and storage.
- Zustand is used for local lesson-editor state.

## Core Commands
Run these from the repo root:

- `npm run dev` — start local dev server.
- `npm run build` — production build.
- `npm run lint` — lint the app.
- `npm run typecheck:supabase` — validate Supabase-related TypeScript checks.
- `npm run test:supabase` — execute the Supabase smoke test script.

## Architectural Conventions
- Prefer keeping route/page logic thin and move business logic into `lib/` or `services/`.
- Preserve the existing feature grouping: lesson logic in `lib/lessons.ts`, evaluation logic in `lib/evaluations.ts`, banner logic in `lib/banners.ts`, and generic Supabase helpers in `lib/supabase.ts` and `lib/supabaseClient.ts`.
- If a change touches a data flow, check the corresponding migration and existing patterns before creating new schema or service methods.
- Use typed interfaces for database rows when working in the Supabase layer; do not widen them casually.
- Client components should usually stay in `components/` and use small, focused props rather than embedding domain logic inline.

## Supabase and Auth Notes
- The project expects environment variables such as `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- `lib/supabase.ts` includes a helper to detect whether Supabase is configured.
- Browser auth is created with `createBrowserClient` in some app entries and is intentionally configured with PKCE session persistence.
- Many routes depend on instructor/student identity and token-based lesson access. Keep access checks consistent with the existing patterns.

## Route and Feature Notes
- Instructor flows live under `app/instructor/` and often use dynamic tokens and lesson slugs.
- Student experience is structured around `app/dashboard/`, `app/lessons/`, and related route groups.
- Lesson editor state is managed through Zustand; follow the established store patterns when editing lesson behavior.
- Submission/evaluation screens are designed around both legacy callback flows and Supabase-backed flows, so maintain compatibility unless the change explicitly removes legacy support.

## Working Rules for Changes
- Keep edits narrow and consistent with the existing file structure.
- Prefer reusing helpers from `lib/` over adding redundant logic in page files.
- When modifying data access, verify the likely schema and migration history before introducing new columns or table names.
- Do not duplicate documentation; link to the existing docs instead of copying large sections into new agent instructions.
- Prefer small, verifiable changes and run the relevant check after implementation.

## Common Pitfalls
- Some screens rely on placeholder Supabase values when env vars are missing; do not assume production credentials are present in local dev.
- Dynamic route parameters and token-based access are sensitive; avoid breaking instructor/student routing assumptions.
- The codebase mixes local UI state and persistence flows; if a feature uses both, keep the data flow explicit rather than hidden in a page component.

## Recommended Workflow
1. Inspect the relevant feature area and existing lib/service file.
2. Match the project’s naming and data access patterns before editing.
3. Run the smallest relevant verification command after the patch.
4. Update docs only if the change materially changes developer workflow or architecture.
