import type { LessonContent, LessonEvaluation, PublishedLessonState, StrictStepContent, StudentProfile, StudentSubmission } from "@/types/lesson";
import { findUser, STUDENT_USERS, type StudentUser } from "@/lib/users";

export type { PublishedLessonState } from "@/types/lesson";

export const LESSON_STATE_PREFIX = "fluentia:published-lesson:";
export const LAST_ACCESSED_LESSON_KEY = "fluentia:last-accessed-lesson";
export const ACTIVE_STUDENT_TOKEN_KEY = "fluentia:active-student-token";
export const INSTRUCTOR_TOKEN = "avoss-9042";
const LEGACY_STUDENT_TOKENS: Record<string, string> = {
  "yasaman-s": "yasaman-5184",
};

function normalizeStudentToken(value?: string | null) {
  const token = value?.trim();
  return token ? LEGACY_STUDENT_TOKENS[token] || token : null;
}

export function resolveStudentAccess(explicitToken?: string | null): StudentUser | null {
  const requestedToken = normalizeStudentToken(explicitToken);
  const storedToken = typeof window !== "undefined"
    ? window.localStorage.getItem(ACTIVE_STUDENT_TOKEN_KEY) || window.localStorage.getItem("fluentia:active-user")
    : null;
  const candidates = [requestedToken, normalizeStudentToken(storedToken)].filter(Boolean) as string[];
  return candidates.reduce<StudentUser | null>((student, token) =>
    student || STUDENT_USERS.find((user) => user.token === token || user.id === token) || null,
  null);
}

export function persistResolvedStudent(student: StudentUser) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACTIVE_STUDENT_TOKEN_KEY, student.token);
  window.localStorage.setItem("fluentia:active-user", student.token);
}

export function resolveActiveStudent(explicitToken?: string | null): StudentUser {
  const requestedToken = explicitToken?.trim();
  const storedToken = typeof window !== "undefined"
    ? window.localStorage.getItem(ACTIVE_STUDENT_TOKEN_KEY) || window.localStorage.getItem("fluentia:active-user")
    : null;
  const requestedUser = STUDENT_USERS.find((user) => user.token === (requestedToken || storedToken) || user.id === (requestedToken || storedToken));
  return requestedUser || STUDENT_USERS[0];
}

export function persistActiveStudentToken(explicitToken?: string | null): StudentUser {
  const student = resolveActiveStudent(explicitToken);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(ACTIVE_STUDENT_TOKEN_KEY, student.token);
    window.localStorage.setItem("fluentia:active-user", student.token);

    if (!explicitToken?.trim() || !findUser(explicitToken)?.token) {
      const params = new URLSearchParams(window.location.search);
      params.delete("token");
      params.set("student", student.token);
      const query = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
    }
  }
  return student;
}

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
      || (studentToken === "arash-1024"
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