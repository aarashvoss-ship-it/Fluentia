import { STANDARD_LESSONS } from "@/lib/lesson-store";
import type { LessonContent } from "@/types/lesson";

export const LESSONS = STANDARD_LESSONS;

export function getLesson(slug: string) {
  return LESSONS.find((lesson) => lesson.slug === slug) || LESSONS[0];
}

export const LESSONS_MANIFEST_KEY = "fluentia:lessons-manifest";

export function readLessonsManifest(): LessonContent[] {
  if (typeof window === "undefined") return LESSONS;

  try {
    const stored = window.localStorage.getItem(LESSONS_MANIFEST_KEY);
    const dynamicLessons = stored ? (JSON.parse(stored) as LessonContent[]) : [];
    const dynamicBySlug = new Map(dynamicLessons.map((lesson) => [lesson.slug, lesson]));
    return [
      ...LESSONS.map((lesson) => dynamicBySlug.get(lesson.slug) || lesson),
      ...dynamicLessons.filter((lesson) => !LESSONS.some((base) => base.slug === lesson.slug)),
    ];
  } catch {
    return LESSONS;
  }
}

export function writeLessonToManifest(lesson: LessonContent) {
  if (typeof window === "undefined") return;
  const lessons = readLessonsManifest().filter((item) => item.slug !== lesson.slug);
  window.localStorage.setItem(LESSONS_MANIFEST_KEY, JSON.stringify([...lessons, lesson]));
}

export const isSupabaseConfigured = () => true;