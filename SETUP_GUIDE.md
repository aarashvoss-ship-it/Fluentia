# Fluentia Frontend Integration - Quick Start Guide

This guide helps you set up the Zustand + Supabase integration for the Fluentia learning platform.

## Prerequisites

- Node.js 18+
- Next.js 15+ (already installed)
- Supabase account and project

## Step 1: Install Required Dependencies

```bash
npm install zustand immer
```

**What these packages do:**
- **zustand**: Lightweight state management library
- **immer**: Enables immutable state updates (used via Zustand middleware)

Verify installation:
```bash
npm list zustand immer
```

## Step 2: Set Up Environment Variables

Create or update `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-name.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
DATABASE_URL=postgresql://user:password@host:5432/database?sslmode=require
JWT_SECRET=generate-a-random-secret-with-at-least-32-bytes
```

`SUPABASE_SERVICE_ROLE_KEY` is required for instructor-side student and instructor management. Keep it server-only; never rename it with a `NEXT_PUBLIC_` prefix or expose it to browser code.
`DATABASE_URL` (or `POSTGRES_URL`) is used by native sign-up/sign-in and must point to the Paasta PostgreSQL database. `JWT_SECRET` signs HttpOnly session cookies; keep it server-only and use a cryptographically random value of at least 32 bytes. On Node.js server startup and before auth/waitlist database requests, Fluentia safely creates or adds the native-auth and waitlist tables/columns if they are missing. The database role must be allowed to create tables and indexes and alter its own tables in `public`; initialization errors are logged. Local startup skips initialization when the database host cannot be resolved. This bootstrap covers native authentication and waitlist storage, not the rest of the application schema.

Google sign-in uses Google's OAuth authorization-code flow. Configure server-only `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, and set `GOOGLE_REDIRECT_URI` to the exact registered callback URL (for example, `https://fluential.ir/api/auth/google/callback` in production or `http://localhost:3000/api/auth/google/callback` locally). Only the three explicitly allowlisted Google identities can use this flow, and each must already have a matching row in `public.users`; OAuth does not create replacement accounts or alter historical records.

For an existing `public.users` account that has no `password_hash`, standard email/password sign-in can be bootstrapped without Google by setting the server-only `TEMP_USER_PASSWORD_HASHES_B64` variable. Its value must be base64-encoded JSON mapping each email to a bcrypt hash. Run `node generate-temp-passwords.mjs user@example.com` to generate a strong one-time credential and a hash for that account; the script prints the credential once, so share it only with that account holder. Set the printed hash variable in the server environment and restart/redeploy. After a successful bootstrap sign-in, the submitted password is hashed and saved to that user's existing `public.users` row; remove the bootstrap variable after all intended accounts have signed in. A configured database password hash always takes precedence. Sign-up remains invitation-only and checks `public.allowed_users`.

The equivalent manual migrations are [`migrations/054_native_auth.sql`](./migrations/054_native_auth.sql) and [`migrations/055_create_waitlist_requests.sql`](./migrations/055_create_waitlist_requests.sql). Existing accounts without a password hash can use the temporary bcrypt-hash bootstrap described above, or receive a password through a separate, verified onboarding process. Sign-up remains invitation-only and checks `public.allowed_users`.

The landing-page waitlist stores each applicant's name and email in `public.waitlist_requests`. Email notifications are not sent until an email delivery provider is configured.

**How to find these values:**
1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Click Settings → API
4. Copy the project URL, anon (public) key, and service-role key. The service-role key must remain private.

## Step 3: Run Database Migrations

Execute the SQL migration script in Supabase:

1. Go to Supabase Dashboard → Your Project → SQL Editor
2. Click "New Query"
3. Copy the entire contents of `migrations/001_create_base_schema.sql`
4. Paste into the SQL editor
5. Click "Run"

**What this does:**
- Creates `lessons`, `lesson_versions`, `submissions`, `evaluations`, `banners` tables
- Adds indexes for performance
- Enables Row Level Security (RLS)
- Creates RLS policies for authenticated users

## Step 4: Verify Database Schema

In Supabase SQL Editor, run:

```sql
SELECT tablename FROM pg_tables 
WHERE schemaname = 'public' 
ORDER BY tablename;
```

You should see these tables:
- `lessons`
- `lesson_versions`
- `submissions`
- `evaluations`
- `banners`

## Step 5: Update Existing Components

The following files are already updated:

✅ `lib/lesson-editor-store.ts` - Created (Zustand store)
✅ `app/instructor/lessons/[id]/page.tsx` - Created (dynamic route)
✅ `lib/lessons.ts` - Updated (Supabase service)
✅ `lib/supabase.ts` - Enhanced (type definitions)
✅ `components/instructor/instructor-lesson-page.tsx` - Updated (Zustand integration)
✅ `components/instructor/lesson-tailor-editor.tsx` - Updated (async block operations)

No additional changes needed in existing components.

## Step 6: Test the Integration

### 6a. Start Development Server

```bash
npm run dev
```

Visit: [http://localhost:3000](http://localhost:3000)

### 6b. Create a Test Lesson

1. Navigate to instructor dashboard
2. Create a new lesson
3. Check Supabase: `lessons` table should have a new row
4. Check: `lesson_versions` table should have initial version

### 6c. Edit a Lesson

1. Navigate to `/instructor/lessons/[lesson-id]`
2. Modify lesson content (add/edit block)
3. Observe:
   - UI updates immediately (optimistic)
   - "Saving changes..." indicator appears
   - Supabase `lesson_versions` gets new row
   - `version_number` increments

### 6d. Test Error Handling

1. Open DevTools → Network tab
2. Throttle to "Offline"
3. Try to edit a block
4. See red error alert appear
5. Re-enable network
6. Refresh page and retry

## Step 7: Understand the Data Flow

### Loading Lesson (on page mount)

```
/instructor/lessons/[id] 
  ↓
hydrateLessonFromDatabase(id)
  ↓
getLessonById(id) [from lib/lessons.ts]
  ↓
Queries Supabase:
  - lessons table for metadata
  - lesson_versions table for content
  ↓
Store updated with: lesson, content, bannerUrl
  ↓
InstructorLessonPage renders
```

### Updating Block (on edit)

```
User modifies block content
  ↓
LessonTailorEditor onChange triggered
  ↓
updateBlock() action dispatched
  ↓
1. Local state updates immediately (optimistic)
2. isSaving = true
3. updateLesson() called (async)
  ↓
Supabase creates new lesson_version row
  ↓
isSaving = false
  ↓
UI reflects saved state
```

## Common Tasks

### Create a New Lesson Programmatically

```typescript
import { createLesson } from '@/lib/lessons';

const lesson = await createLesson({
  title: 'Spanish Basics',
  subject: 'Spanish',
  grade: 'A1',
  instructor_id: 'user-id-here',
  content: {
    warm_up: { /* ... */ },
    lesson: { /* ... */ },
  },
  changes_summary: 'Created new lesson',
});

console.log(lesson.id); // UUID of created lesson
```

### Fetch All Lessons for a Student

```typescript
import { getLessonsByStudentId } from '@/lib/lessons';

const lessons = await getLessonsByStudentId('student-id');
console.log(lessons.length); // Number of lessons
```

### Update Lesson Metadata and Content

```typescript
import { updateLesson } from '@/lib/lessons';

const updated = await updateLesson(lessonId, {
  title: 'Updated Title',
  subject: 'Updated Subject',
  content: { /* new content */ },
  changes_summary: 'Updated title and content',
});
```

### Access Store in a Component

```typescript
import { useLessonEditorStore } from '@/lib/lesson-editor-store';

export function MyComponent() {
  const {
    lesson,
    content,
    isSaving,
    saveError,
    addBlock,
    updateBlock,
  } = useLessonEditorStore();

  // Use state
  console.log(lesson?.title);
  
  // Dispatch actions
  const handleAddBlock = async () => {
    await addBlock('warm_up', { /* ... */ });
  };

  return (
    <>
      {isSaving && <p>Saving...</p>}
      {saveError && <p style={{ color: 'red' }}>{saveError}</p>}
      <button onClick={handleAddBlock}>Add Block</button>
    </>
  );
}
```

## Troubleshooting

### Issue: "Supabase not configured"
**Cause:** Missing environment variables
**Solution:** Verify `.env.local` has `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Issue: "Lesson not found" error
**Cause:** Lesson ID doesn't exist in database
**Solution:** Verify the lesson was created and the ID is correct

### Issue: "Failed to save block" error
**Cause:** Network issue or RLS policy denying access
**Solution:** 
- Check network in DevTools
- Verify RLS policies in Supabase
- Check user authentication

### Issue: Changes don't persist after refresh
**Cause:** Optimistic update succeeded, but Supabase save failed silently
**Solution:** Check browser console for errors, verify RLS policies

### Issue: Version numbers not incrementing
**Cause:** Content hasn't actually changed
**Solution:** Verify content object is different from current version

## Next Steps

1. **Complete the data migration** - Move remaining Supabase queries, storage, and RLS-protected access to the native PostgreSQL/session model.
2. **Migrate account provisioning** - Replace remaining Supabase Auth Admin calls and onboard existing accounts to native password hashes.
3. **Add real-time updates** - Choose a realtime service compatible with the PostgreSQL migration.
4. **Implement caching** - Add React Query or SWR for better performance.
5. **Add audit logging and backups** - Track changes and establish regular database exports.

## API Reference

See `lib/lessons.ts` for complete API documentation of:
- `getLessons()`
- `getLessonById(id)`
- `getLessonsByStudentId(studentId)`
- `getLessonsByInstructorId(instructorId)`
- `createLesson(input)`
- `updateLesson(id, input)`
- `deleteLesson(id)`
- `getLessonVersions(lessonId)`
- `getLessonVersion(lessonId, versionNumber)`

See `lib/lesson-editor-store.ts` for complete Zustand store actions.

## Additional Resources

- [Zustand Documentation](https://github.com/pmndrs/zustand)
- [Supabase JavaScript Client](https://supabase.com/docs/reference/javascript)
- [Next.js File-based Routing](https://nextjs.org/docs/app/building-your-application/routing)
- [Immer Documentation](https://immerjs.github.io/immer/)

## Support

For issues or questions, check:
1. Browser console for error messages
2. Supabase dashboard for data verification
3. `INTEGRATION_GUIDE.md` for detailed architecture
4. GitHub issues if applicable
