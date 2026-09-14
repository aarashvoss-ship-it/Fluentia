"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useLessonEditorStore } from "@/lib/lesson-editor-store";
import { InstructorLessonPage } from "@/components/instructor/instructor-lesson-page";
import { AccessCard } from "@/components/access/access-card";

/**
 * Dynamic lesson detail page for instructors
 * Route: /instructor/lessons/[id]
 */
export default function LessonDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const lessonId = params?.id;

  const {
    lesson,
    isLoading,
    error,
    hydrateLessonFromDatabase,
  } = useLessonEditorStore();

  // Hydrate lesson data on mount
  useEffect(() => {
    if (lessonId && lessonId !== "new") {
      hydrateLessonFromDatabase(lessonId).catch((err) => {
        console.error("Failed to load lesson:", err);
      });
    }
  }, [lessonId, hydrateLessonFromDatabase]);

  // Handle loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#0f1923" }}>
        <div className="text-center">
          <div className="inline-block">
            <div
              className="h-12 w-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"
            />
          </div>
          <p className="mt-4 text-stone-400 text-sm">Loading lesson...</p>
        </div>
      </div>
    );
  }

  // Handle error state
  if (error) {
    return (
      <AccessCard
        title="Lesson Not Found"
        message={error || "Unable to load the requested lesson. Please try again."}
      />
    );
  }

  // Handle missing lesson
  if (lessonId !== "new" && !lesson) {
    return (
      <AccessCard
        title="Lesson Not Found"
        message="The lesson you're looking for doesn't exist or has been deleted."
      />
    );
  }

  // Render the lesson editor with the loaded lesson
  return lesson ? (
    <InstructorLessonPage lessonId={lesson.id} />
  ) : (
    <AccessCard
      title="No Lesson"
      message="Unable to render the lesson. Please navigate back and try again."
    />
  );
}
