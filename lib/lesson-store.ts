import type { LessonEvaluation, PublishedLessonState, StrictStepContent, StudentProfile, StudentSubmission } from "@/types/lesson";

export type { PublishedLessonState } from "@/types/lesson";

export const LESSON_STATE_PREFIX = "fluentia:published-lesson:";
export const LAST_ACCESSED_LESSON_KEY = "fluentia:last-accessed-lesson";

export function getLessonStateKey(slug: string, studentToken?: string) {
  return `${LESSON_STATE_PREFIX}${slug}:${studentToken || "default"}`;
}

export function readPublishedLessonState(slug: string, studentToken?: string): PublishedLessonState | null {
  if (typeof window === "undefined") return null;

  try {
    const stored = window.localStorage.getItem(getLessonStateKey(slug, studentToken));
    return stored ? (JSON.parse(stored) as PublishedLessonState) : null;
  } catch {
    return null;
  }
}

export function writePublishedLessonState(slug: string, state: PublishedLessonState, studentToken?: string) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(getLessonStateKey(slug, studentToken), JSON.stringify(state));
}

export function readLastAccessedLesson(studentToken?: string) {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(`${LAST_ACCESSED_LESSON_KEY}:${studentToken || "default"}`);
}

export function writeLastAccessedLesson(slug: string, studentToken?: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(`${LAST_ACCESSED_LESSON_KEY}:${studentToken || "default"}`, slug);
}