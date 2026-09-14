/**
 * INTEGRATION GUIDE: Supabase + Zustand + Dynamic Routing
 * 
 * This guide explains how the frontend state management, routing, and database
 * synchronization work together in the Fluentia learning application.
 */

// ============================================================================
// 1. PROJECT DEPENDENCIES
// ============================================================================

/**
 * Ensure you have the following packages installed:
 * 
 * npm install zustand immer @supabase/supabase-js
 * 
 * - zustand: State management library
 * - immer: Immutable state updates (used via Zustand middleware)
 * - @supabase/supabase-js: Supabase client library
 */

// ============================================================================
// 2. FILE STRUCTURE
// ============================================================================

/**
 * Key files created/modified:
 * 
 * lib/
 *   ├── lessons.ts                    (✅ Database service layer)
 *   ├── lesson-editor-store.ts        (✅ NEW - Zustand store)
 *   ├── supabase.ts                   (✅ Enhanced with types)
 *   └── lesson-store.ts               (existing - for backward compatibility)
 * 
 * app/
 *   └── instructor/
 *       └── lessons/
 *           └── [id]/
 *               └── page.tsx          (✅ NEW - Dynamic lesson detail page)
 * 
 * components/
 *   └── instructor/
 *       ├── instructor-lesson-page.tsx (✅ Updated to use Zustand)
 *       └── lesson-tailor-editor.tsx  (✅ Updated to sync with Supabase)
 */

// ============================================================================
// 3. ENVIRONMENT VARIABLES
// ============================================================================

/**
 * Required .env.local variables:
 * 
 * NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
 * NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
 * 
 * These are public variables (safe to expose in client code)
 * and enable the Supabase client to connect to your database.
 */

// ============================================================================
// 4. DATA FLOW ARCHITECTURE
// ============================================================================

/**
 * REQUEST FLOW:
 * 
 * User navigates to /instructor/lessons/[id]
 *         ↓
 * [id]/page.tsx loads
 *         ↓
 * LessonDetailPage component mounts
 *         ↓
 * useLessonEditorStore.hydrateLessonFromDatabase(id) called
 *         ↓
 * getLessonById(id) fetches from Supabase
 * AND getLessonVersions(id) fetches latest content
 *         ↓
 * Store state updated: { lesson, content, bannerUrl, ... }
 *         ↓
 * InstructorLessonPage renders with store data
 *         ↓
 * LessonTailorEditor displays blocks
 * 
 * 
 * UPDATE FLOW (when instructor edits):
 * 
 * User modifies lesson content
 *         ↓
 * LessonTailorEditor onChange triggered
 *         ↓
 * Zustand store action called (e.g., addBlock, updateBlock)
 *         ↓
 * Local optimistic update applied immediately (fast UI)
 *         ↓
 * Async Supabase call in background: updateLesson()
 *         ↓
 * New version row created in lesson_versions table
 *         ↓
 * On success: isSaving flag cleared
 * On error: saveError populated, displayed to user
 */

// ============================================================================
// 5. ZUSTAND STORE - useLessonEditorStore
// ============================================================================

/**
 * Location: lib/lesson-editor-store.ts
 * 
 * State Properties:
 * - lesson: LessonWithVersion | null
 * - content: StrictStepContent (the actual lesson blocks)
 * - bannerUrl: string
 * - isLoading: boolean (during initial fetch)
 * - isSaving: boolean (during block updates)
 * - error: string | null (loading errors)
 * - saveError: string | null (save errors)
 * 
 * Core Actions:
 * 
 * 1. hydrateLessonFromDatabase(lessonId)
 *    - Fetches lesson from DB on page load
 *    - Sets lesson, content, bannerUrl
 *    - Handles loading/error states
 * 
 * 2. Block Operations (with Supabase sync):
 *    - addBlock(stepId, block)
 *    - updateBlock(stepId, blockId, updates)
 *    - deleteBlock(stepId, blockId)
 *    - toggleBlock(stepId, blockId)
 *    - reorderBlocks(stepId, fromIndex, toIndex)
 * 
 * 3. Metadata Operations:
 *    - updateBanner(url)
 *    - updateLessonMetadata(title, subject)
 * 
 * 4. Publishing:
 *    - publishLesson() - sets status to 'published'
 * 
 * Usage in components:
 * 
 *   const { lesson, content, isSaving, addBlock } = useLessonEditorStore();
 *   
 *   // Dispatch action
 *   await addBlock('warm_up', myBlock);
 */

// ============================================================================
// 6. DATABASE SERVICE - lib/lessons.ts
// ============================================================================

/**
 * Location: lib/lessons.ts
 * 
 * Functions:
 * 
 * 1. getLessons()
 *    Returns: Promise<LessonWithVersion[]>
 *    - Fetches all lessons with latest version content
 *    - Called when instructor views lessons list
 * 
 * 2. getLessonById(id)
 *    Returns: Promise<LessonWithVersion | null>
 *    - Fetches single lesson + its latest version
 *    - Called on lesson detail page load
 * 
 * 3. createLesson(input)
 *    Returns: Promise<LessonWithVersion>
 *    - Creates lesson row + initial version row atomically
 *    - Called when instructor creates new lesson
 * 
 * 4. updateLesson(id, input)
 *    Returns: Promise<LessonWithVersion>
 *    - Updates lesson metadata
 *    - Creates new version row if content provided
 *    - Called by Zustand store actions
 * 
 * 5. getLessonVersions(lessonId)
 *    Returns: Promise<LessonVersionRow[]>
 *    - Gets all versions for version history
 * 
 * 6. getLessonVersion(lessonId, versionNumber)
 *    Returns: Promise<LessonVersionRow | null>
 *    - Gets specific version for rollback/comparison
 */

// ============================================================================
// 7. ROUTING - app/instructor/lessons/[id]/page.tsx
// ============================================================================

/**
 * Location: app/instructor/lessons/[id]/page.tsx
 * 
 * Route: /instructor/lessons/[id]
 * 
 * Responsibilities:
 * 1. Extracts lesson ID from URL params
 * 2. Triggers hydration on mount
 * 3. Shows loading spinner while fetching
 * 4. Shows error card if lesson not found
 * 5. Renders InstructorLessonPage once loaded
 * 
 * Example URLs:
 * - /instructor/lessons/550e8400-e29b-41d4-a716-446655440000
 * - /instructor/lessons/new (can be extended for new lessons)
 */

// ============================================================================
// 8. COMPONENT UPDATES
// ============================================================================

/**
 * Updated Components:
 * 
 * A. instructor-lesson-page.tsx
 *    - Now uses Zustand store instead of local useState
 *    - Displays isSaving indicator
 *    - Shows saveError alerts
 *    - All actions tied to async store methods
 * 
 * B. lesson-tailor-editor.tsx
 *    - Imports useLessonEditorStore
 *    - Block changes trigger store actions
 *    - Reorder/add/delete now sync to Supabase
 *    - Optional onChange callback for backward compatibility
 */

// ============================================================================
// 9. ERROR HANDLING & STATES
// ============================================================================

/**
 * Loading State:
 * - Display: Spinner + "Loading lesson..."
 * - Flag: isLoading
 * - Duration: Initial page load
 * 
 * Saving State:
 * - Display: "Saving changes..." indicator
 * - Flag: isSaving
 * - Duration: During block updates
 * 
 * Error State (Initial Load):
 * - Display: "Lesson Not Found" access card
 * - Flag: error
 * - Cause: Lesson ID doesn't exist in DB
 * 
 * Save Error State:
 * - Display: Red alert with error message
 * - Flag: saveError
 * - Duration: 5 seconds, then auto-hidden
 * - Cause: Block update failed (network, permission, etc.)
 */

// ============================================================================
// 10. OPTIMISTIC UPDATES
// ============================================================================

/**
 * Pattern Used:
 * 
 * const updateBlock = async (stepId, blockId, updates) => {
 *   // 1. OPTIMISTIC: Update local state immediately
 *   set((draft) => {
 *     const block = findBlock(draft, stepId, blockId);
 *     Object.assign(block, updates);
 *   });
 * 
 *   // 2. ASYNC: Persist to Supabase in background
 *   set({ isSaving: true, saveError: null });
 *   try {
 *     await updateLesson(lesson.id, { content: currentState, ... });
 *     set({ isSaving: false });
 *   } catch (error) {
 *     set({ isSaving: false, saveError: error.message });
 *   }
 * };
 * 
 * Benefits:
 * - UI feels instant (no waiting for network)
 * - User sees changes immediately
 * - Supabase sync happens in background
 * - If sync fails, user sees error message
 * - Can implement rollback if needed
 */

// ============================================================================
// 11. VERSION CONTROL
// ============================================================================

/**
 * How Versioning Works:
 * 
 * Initial Creation:
 *   1. User creates lesson
 *   2. Lesson row inserted → id = uuid-1
 *   3. Version row inserted → version_number = 1, content = {...}
 * 
 * First Update:
 *   1. User modifies blocks
 *   2. Zustand calls updateLesson()
 *   3. New version row inserted → version_number = 2, content = {...}
 *   4. Lesson row NOT modified (title, subject stay same)
 * 
 * Subsequent Updates:
 *   1. Repeat: Each content change = new version row
 *   2. version_number increments: 3, 4, 5, ...
 * 
 * Benefits:
 * - Complete audit trail
 * - Can view changes over time
 * - Can rollback to previous versions
 * - Unique constraint prevents duplicates: (lesson_id, version_number)
 */

// ============================================================================
// 12. TESTING THE INTEGRATION
// ============================================================================

/**
 * Manual Testing Steps:
 * 
 * 1. Create a lesson via the instructor dashboard
 *    → Check Supabase: lessons table + lesson_versions table
 * 
 * 2. Navigate to /instructor/lessons/[id]
 *    → Verify page loads and displays lesson content
 *    → Check console for hydration logs
 * 
 * 3. Edit a block (title, content, etc.)
 *    → UI updates immediately (optimistic)
 *    → "Saving changes..." indicator appears briefly
 *    → Check Supabase: new row in lesson_versions
 * 
 * 4. Add a new block
 *    → Appears in editor immediately
 *    → Background sync to Supabase
 *    → Version number increments
 * 
 * 5. Delete a block
 *    → Removed from UI immediately
 *    → Supabase updated with new content
 *    → Version number increments
 * 
 * 6. Publish lesson
 *    → Click "Publish Lesson" button
 *    → Lesson status changes to 'published'
 *    → New version created with "Lesson published" summary
 * 
 * 7. Network error test
 *    → Disable network in DevTools
 *    → Try to edit a block
 *    → See saveError message appear
 *    → Re-enable network
 *    → Retry or reload page
 */

// ============================================================================
// 13. MIGRATION NOTES
// ============================================================================

/**
 * If Migrating from Mock Data:
 * 
 * OLD: lesson-store.ts with STANDARD_LESSONS array
 * NEW: lib/lessons.ts with Supabase queries
 * 
 * What Changed:
 * - Mock MOCK_INSTRUCTOR_LESSONS → Real Supabase data
 * - LocalStorage fallback → No longer needed
 * - Static lesson list → Dynamic database queries
 * - Manual state management → Zustand + async actions
 * 
 * Backward Compatibility:
 * - lesson-store.ts kept for legacy components
 * - lesson-tailor-editor.tsx still accepts onChange
 * - Can run both systems in parallel during transition
 * 
 * Recommended Migration Path:
 * 1. Keep mock data for development
 * 2. Test Supabase integration on feature branch
 * 3. Run migration script to seed real data
 * 4. Gradually update components to use store
 * 5. Remove mock data once fully migrated
 */

// ============================================================================
// 14. PERFORMANCE CONSIDERATIONS
// ============================================================================

/**
 * Optimizations Implemented:
 * 
 * 1. Lazy Version Fetching
 *    - Only fetch latest version by default
 *    - Use getLessonVersions() when needed
 * 
 * 2. Indexes on Common Queries
 *    - student_id, instructor_id, status, created_at
 *    - Speeds up filtering and sorting
 * 
 * 3. Optimistic Updates
 *    - UI feels instant
 *    - Network latency not visible to user
 * 
 * 4. Pagination (Future)
 *    - If lesson lists get large
 *    - Implement cursor-based pagination
 * 
 * 5. Caching (Future)
 *    - Consider React Query or SWR
 *    - Cache lesson data to avoid re-fetches
 *    - Invalidate on updates
 */

// ============================================================================
// 15. SECURITY & RLS
// ============================================================================

/**
 * Row Level Security (RLS) Policies:
 * 
 * lessons table:
 * - Users can view their own lessons (student_id or instructor_id match)
 * - Can create lessons
 * - Can update/delete own lessons
 * 
 * lesson_versions table:
 * - Can view if associated lesson is yours
 * - Can create/update/delete own versions
 * 
 * submissions table:
 * - Students view own submissions
 * - Instructors view student submissions
 * 
 * evaluations table:
 * - Instructors can view/create own evaluations
 * - Students view evaluations on their submissions
 * 
 * Note: RLS policies defined in migrations/001_create_base_schema.sql
 */

// ============================================================================
// 16. NEXT STEPS & IMPROVEMENTS
// ============================================================================

/**
 * Potential Enhancements:
 * 
 * 1. Real-time Collaboration
 *    - Use Supabase Realtime subscriptions
 *    - Multiple instructors editing same lesson
 *    - Show active users, cursor positions
 * 
 * 2. Lesson Templates
 *    - Save lesson as template
 *    - Clone templates for new lessons
 *    - Share templates with other instructors
 * 
 * 3. Batch Operations
 *    - Bulk update blocks
 *    - Batch delete lessons
 * 
 * 4. Conflict Resolution
 *    - Handle concurrent edits
 *    - Version merging strategies
 *    - Last-write-wins vs. merge
 * 
 * 5. Audit Logging
 *    - Track who changed what and when
 *    - Use Supabase audit tables
 * 
 * 6. Lesson Search
 *    - Full-text search via Supabase
 *    - Filter by subject, grade, status
 */

export {};
