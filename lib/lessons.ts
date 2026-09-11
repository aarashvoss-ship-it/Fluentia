import { LessonContent } from "@/types/lesson";

export const LESSONS: LessonContent[] = [
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
];

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