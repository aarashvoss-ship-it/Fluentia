/**
 * QUICK API REFERENCE
 * Copy-paste service functions with full type signatures
 */

// ============================================================================
// SUBMISSIONS (lib/evaluations.ts)
// ============================================================================

// Create a new submission
export async function createSubmission(input: {
  lesson_id: string;
  student_id: string;
  answers: Record<string, any>;
  status?: "submitted" | "in_progress";
}): Promise<SubmissionRow>

// Get submission by ID
export async function getSubmissionById(id: string): Promise<SubmissionWithEvaluation | null>

// Get all submissions for a lesson
export async function getSubmissionsByLessonId(lessonId: string): Promise<SubmissionWithEvaluation[]>

// Get all submissions for a student
export async function getSubmissionsByStudentId(studentId: string): Promise<SubmissionWithEvaluation[]>

// Get submission for specific lesson+student combo (MOST COMMON)
export async function getSubmissionByLessonAndStudent(
  lessonId: string,
  studentId: string
): Promise<SubmissionWithEvaluation | null>

// Update submission
export async function updateSubmission(id: string, input: {
  answers?: Record<string, any>;
  status?: "submitted" | "in_progress" | "reviewed";
}): Promise<SubmissionRow>

// Delete submission
export async function deleteSubmission(id: string): Promise<void>

// ============================================================================
// EVALUATIONS (lib/evaluations.ts)
// ============================================================================

// Create evaluation (also updates submission status to 'reviewed')
export async function createEvaluation(input: {
  submission_id: string;
  instructor_id: string;
  feedback?: string;
  score?: number;
}): Promise<EvaluationRow>

// Get evaluation by ID
export async function getEvaluationById(id: string): Promise<EvaluationRow | null>

// Get evaluation for a submission
export async function getEvaluationBySubmissionId(submissionId: string): Promise<EvaluationRow | null>

// Get all evaluations for a lesson (all students)
export async function getEvaluationsByLessonId(lessonId: string): Promise<EvaluationRow[]>

// Get all evaluations created by an instructor
export async function getEvaluationsByInstructorId(instructorId: string): Promise<EvaluationRow[]>

// Update evaluation
export async function updateEvaluation(id: string, input: {
  feedback?: string;
  score?: number;
}): Promise<EvaluationRow>

// Delete evaluation (reverts submission to 'submitted')
export async function deleteEvaluation(id: string): Promise<void>

// ============================================================================
// BANNERS (lib/banners.ts)
// ============================================================================

// Create banner
export async function createBanner(input: {
  title: string;
  message: string;
  is_active?: boolean;
}): Promise<BannerRow>

// Get all banners (active & inactive)
export async function getBanners(): Promise<BannerRow[]>

// Get only active banners (FOR UI DISPLAY)
export async function getActiveBanners(): Promise<BannerRow[]>

// Get banner by ID
export async function getBannerById(id: string): Promise<BannerRow | null>

// Update banner
export async function updateBanner(id: string, input: {
  title?: string;
  message?: string;
  is_active?: boolean;
}): Promise<BannerRow>

// Toggle banner active/inactive
export async function toggleBannerActive(id: string, isActive: boolean): Promise<BannerRow>

// Delete single banner
export async function deleteBanner(id: string): Promise<void>

// Delete ALL banners
export async function deleteAllBanners(): Promise<void>

// Deactivate ALL banners
export async function deactivateAllBanners(): Promise<void>

// ============================================================================
// LESSONS (lib/lessons.ts - For Reference)
// ============================================================================

// Get all lessons
export async function getLessons(): Promise<LessonWithVersion[]>

// Get lesson by ID
export async function getLessonById(id: string): Promise<LessonWithVersion | null>

// Get lessons for a student
export async function getLessonsByStudentId(studentId: string): Promise<LessonWithVersion[]>

// Get lessons for an instructor
export async function getLessonsByInstructorId(instructorId: string): Promise<LessonWithVersion[]>

// Create new lesson
export async function createLesson(input: {
  title: string;
  subject: string;
  content: LessonContent;
  student_id?: string;
  instructor_id?: string;
  status?: string;
}): Promise<LessonWithVersion>

// Update lesson (creates new version)
export async function updateLesson(id: string, input: {
  title?: string;
  subject?: string;
  content?: LessonContent;
  status?: string;
}): Promise<LessonWithVersion>

// Delete lesson
export async function deleteLesson(id: string): Promise<void>

// ============================================================================
// COMMON USAGE PATTERNS
// ============================================================================

/**
 * PATTERN 1: Load submission for evaluation
 */
const submission = await getSubmissionByLessonAndStudent(lessonId, studentId);
if (submission) {
  console.log("Answers:", submission.answers);
  console.log("Status:", submission.status);
  console.log("Evaluation:", submission.evaluation); // null if not yet evaluated
}

/**
 * PATTERN 2: Submit evaluation
 */
const evaluation = await createEvaluation({
  submission_id: submission.id,
  instructor_id: instructorId,
  feedback: "Great work!",
  score: 18
});

/**
 * PATTERN 3: Update evaluation
 */
await updateEvaluation(evaluation.id, {
  feedback: "Updated feedback",
  score: 19
});

/**
 * PATTERN 4: Get all submissions for lesson (instructor view)
 */
const allSubmissions = await getSubmissionsByLessonId(lessonId);
allSubmissions.forEach(sub => {
  console.log(`${sub.student_id}: ${sub.status}`);
});

/**
 * PATTERN 5: Display active banners (UI)
 */
const banners = await getActiveBanners();
banners.forEach(banner => {
  // Render banner.title and banner.message
});

/**
 * PATTERN 6: Create announcement
 */
const banner = await createBanner({
  title: "Maintenance Window",
  message: "System will be offline 2-4pm tomorrow",
  is_active: true
});

/**
 * PATTERN 7: Deactivate after event
 */
await toggleBannerActive(banner.id, false);

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface SubmissionRow {
  id: string;
  lesson_id: string;
  student_id: string;
  answers: Record<string, any>;
  status: "submitted" | "in_progress" | "reviewed";
  submitted_at: string; // ISO datetime
}

interface SubmissionWithEvaluation extends SubmissionRow {
  evaluation?: EvaluationRow;
}

interface EvaluationRow {
  id: string;
  submission_id: string;
  instructor_id: string;
  feedback: string;
  score: number;
  evaluated_at: string; // ISO datetime
}

interface BannerRow {
  id: string;
  title: string;
  message: string;
  is_active: boolean;
  created_at: string; // ISO datetime
}

interface LessonRow {
  id: string;
  title: string;
  subject: string;
  status: string;
  student_id?: string;
  instructor_id?: string;
  created_at: string;
}

interface LessonVersionRow {
  id: string;
  lesson_id: string;
  content: LessonContent;
  version_number: number;
  created_at: string;
}

interface LessonWithVersion extends LessonRow {
  currentVersion?: LessonVersionRow;
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

/**
 * All service functions use try-catch and throw errors
 * Catch them like this:
 */

try {
  const submission = await getSubmissionByLessonAndStudent(lessonId, studentId);
  // Use submission...
} catch (error) {
  if (error instanceof Error) {
    console.error("Error:", error.message);
  }
}

/**
 * Common error scenarios:
 * - "Supabase not configured" - Check .env.local
 * - "No rows found" - Record doesn't exist
 * - Network errors - Supabase unreachable
 * - RLS policy violations - Permission denied
 */

// ============================================================================
// ASYNC/AWAIT USAGE
// ============================================================================

/**
 * All functions are async and must be awaited
 */

// ❌ WRONG
const submission = getSubmissionByLessonAndStudent(lessonId, studentId);
console.log(submission.id); // undefined!

// ✅ CORRECT
const submission = await getSubmissionByLessonAndStudent(lessonId, studentId);
if (submission) {
  console.log(submission.id);
}

// ✅ ALSO CORRECT (in useEffect)
useEffect(() => {
  const load = async () => {
    const submission = await getSubmissionByLessonAndStudent(lessonId, studentId);
    // ...
  };
  load();
}, [lessonId, studentId]);

// ============================================================================
// COMPONENT INTEGRATION
// ============================================================================

/**
 * SubmissionEvaluator Component
 */
<SubmissionEvaluator
  lessonId={lesson.id}
  studentId={student.id}
  instructorId={auth.user.id}
  studentName={student.name}
  useSupabase={true} // Uses service functions internally
/>

/**
 * StudentContextPanel Component
 */
<StudentContextPanel
  studentId={student.id}
  lessonId={lesson.id}
  useSupabase={true} // Fetches real data
/>

/**
 * To display banners
 */
useEffect(() => {
  const load = async () => {
    const banners = await getActiveBanners();
    setBanners(banners);
  };
  load();
}, []);

// ============================================================================
// RETURN TYPES AT A GLANCE
// ============================================================================

// Submission functions return:
createSubmission()              → SubmissionRow
getSubmissionById()             → SubmissionWithEvaluation | null
getSubmissionsByLessonId()      → SubmissionWithEvaluation[]
getSubmissionsByStudentId()     → SubmissionWithEvaluation[]
getSubmissionByLessonAndStudent() → SubmissionWithEvaluation | null
updateSubmission()              → SubmissionRow
deleteSubmission()              → void

// Evaluation functions return:
createEvaluation()              → EvaluationRow
getEvaluationById()             → EvaluationRow | null
getEvaluationBySubmissionId()   → EvaluationRow | null
getEvaluationsByLessonId()      → EvaluationRow[]
getEvaluationsByInstructorId()  → EvaluationRow[]
updateEvaluation()              → EvaluationRow
deleteEvaluation()              → void

// Banner functions return:
createBanner()                  → BannerRow
getBanners()                    → BannerRow[]
getActiveBanners()              → BannerRow[]
getBannerById()                 → BannerRow | null
updateBanner()                  → BannerRow
toggleBannerActive()            → BannerRow
deleteBanner()                  → void
deleteAllBanners()              → void
deactivateAllBanners()          → void

// ============================================================================
// IMPORTS
// ============================================================================

// For submissions/evaluations:
import {
  createSubmission,
  getSubmissionByLessonAndStudent,
  createEvaluation,
  updateEvaluation,
  deleteEvaluation,
  type SubmissionWithEvaluation,
} from "@/lib/evaluations";

// For banners:
import {
  createBanner,
  getActiveBanners,
  toggleBannerActive,
  deleteBanner,
  type BannerRow,
} from "@/lib/banners";

// For lessons:
import {
  getLessons,
  getLessonById,
  createLesson,
  updateLesson,
  type LessonWithVersion,
} from "@/lib/lessons";

export {};
