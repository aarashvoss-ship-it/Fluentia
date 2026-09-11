import { InstructorLessonMock } from "@/types/lesson";

export const MOCK_INSTRUCTOR_LESSONS: Record<string, InstructorLessonMock> = {
  "habits-01": {
    id: "habits-01",
    title: "The Architecture of Daily Habits",
    moduleNumber: 1,
    studentName: "Arash",
    bannerUrl: "https://images.unsplash.com/photo-1506744038136-46273834b3fb",
    studentProfile: {
      id: "student-arash",
      fullName: "Arash",
      level: "B2 Upper Intermediate",
      targetGoal: "Advanced C1 Fluency & Professional Writing",
      weaknesses: [
        "Complex prepositions",
        "Nuanced idioms",
        "Tone consistency",
      ],
      teacherNotes: "Strong active vocabulary; focus on academic connectors.",
      attendanceRate: 95,
      completedModulesCount: 12,
    },
    content: {
      warm_up: {
        prompt: {
          text: "What is one small habit that shapes your morning?",
          enabled: true,
        },
      },
      lesson: {
        mainArticle: {
          text: "Friction as Architecture: Designing environments for focus.",
          enabled: true,
        },
      },
      reading: {
        mainArticle: {
          text: "Friction as Architecture: Designing environments for focus.",
          enabled: true,
        },
      },
    },
  },
};
