import type { LessonEvaluation, PublishedLessonState, StrictStepContent, StudentProfile, StudentSubmission } from "@/types/lesson";
import { findUser, STUDENT_USERS, type StudentUser } from "@/lib/users";

export type { PublishedLessonState } from "@/types/lesson";

export const LESSON_STATE_PREFIX = "fluentia:published-lesson:";
export const LAST_ACCESSED_LESSON_KEY = "fluentia:last-accessed-lesson";
export const ACTIVE_STUDENT_TOKEN_KEY = "fluentia:active-student-token";
export const INSTRUCTOR_TOKEN = "avoss-9042";

function normalizeStudentToken(value?: string | null) {
  const token = value?.trim();
  return token && /^[a-z0-9]+-\d{4}$/.test(token) ? token : null;
}

export function resolveStudentAccess(explicitToken?: string | null): StudentUser | null {
  const requestedToken = normalizeStudentToken(explicitToken);
  if (explicitToken?.trim()) {
    return requestedToken
      ? STUDENT_USERS.find((user) => user.token === requestedToken || user.id === requestedToken) || null
      : null;
  }
  const storedToken = typeof window !== "undefined"
    ? window.localStorage.getItem(ACTIVE_STUDENT_TOKEN_KEY) || window.localStorage.getItem("fluentia:active-user")
    : null;
  const stored = normalizeStudentToken(storedToken);
  return stored
    ? STUDENT_USERS.find((user) => user.token === stored || user.id === stored) || null
    : null;
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