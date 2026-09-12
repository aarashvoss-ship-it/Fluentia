import type { LessonContent, LessonEvaluation, PublishedLessonState, StrictStepContent, StudentProfile, StudentSubmission } from "@/types/lesson";

export type { PublishedLessonState } from "@/types/lesson";

export const LESSON_STATE_PREFIX = "fluentia:published-lesson:";
export const LAST_ACCESSED_LESSON_KEY = "fluentia:last-accessed-lesson";

export const STANDARD_LESSONS: LessonContent[] = [
  {
    id: "lesson-habits-01",
    slug: "habits-01",
    title: "The Architecture of Daily Habits",
    subtitle: "Understanding Cue, Routine, and Reward in Modern Productivity",
    moduleNumber: 1,
    instructor: { fullName: "AVoss", initials: "AV" },
    studentName: "Arash",
    coverImage: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&q=80",
    status: "published",
  },
  {
    id: "lesson-habits-02",
    slug: "habits-02",
    title: "Designing Better Routines",
    subtitle: "Turn small environmental changes into lasting momentum",
    moduleNumber: 2,
    instructor: { fullName: "AVoss", initials: "AV" },
    studentName: "Arash",
    coverImage: "https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=1200&q=80",
    status: "published",
  },
  {
    id: "lesson-business-pitch-01",
    slug: "business-pitch-01",
    title: "Business Pitching 101",
    subtitle: "Present ideas with clarity, confidence, and purpose",
    moduleNumber: 3,
    instructor: { fullName: "AVoss", initials: "AV" },
    studentName: "Arash",
    coverImage: "https://images.unsplash.com/photo-1556761175-b413da4baf72?w=1200&q=80",
    status: "published",
  },
];

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

export function readLastAccessedLesson(studentToken?: string) {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(`${LAST_ACCESSED_LESSON_KEY}:${studentToken || "default"}`);
}

export function writeLastAccessedLesson(slug: string, studentToken?: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(`${LAST_ACCESSED_LESSON_KEY}:${studentToken || "default"}`, slug);
}