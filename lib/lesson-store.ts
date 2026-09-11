import { LessonEvaluation, StrictStepContent, StudentProfile, StudentSubmission } from "@/types/lesson";

export interface PublishedLessonState {
  content: StrictStepContent;
  bannerUrl: string;
  studentProfile: StudentProfile;
  evaluation: LessonEvaluation;
  status: "draft" | "published";
  submission?: StudentSubmission;
}

export const LESSON_STATE_PREFIX = "fluentia:published-lesson:";

export function getLessonStateKey(slug: string, studentToken?: string) {
  return `${LESSON_STATE_PREFIX}${slug}:${studentToken || "default"}`;
}

export function readPublishedLessonState(slug: string, studentToken?: string): PublishedLessonState | null {
  if (typeof window === "undefined") return null;

  try {
    const stored = window.localStorage.getItem(getLessonStateKey(slug, studentToken))
      || (studentToken === "arash-test"
        ? window.localStorage.getItem(`${LESSON_STATE_PREFIX}${slug}`)
        : null);
    return stored ? (JSON.parse(stored) as PublishedLessonState) : null;
  } catch {
    return null;
  }
}

export function writePublishedLessonState(slug: string, state: PublishedLessonState, studentToken?: string) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(getLessonStateKey(slug, studentToken), JSON.stringify(state));
}