"use client";

import { useEffect, useState } from "react";
import { useLessonEditorStore } from "@/lib/lesson-editor-store";
import { StudentContextPanel } from "@/components/instructor/student-context-panel";
import { LessonTailorEditor } from "@/components/instructor/lesson-tailor-editor";
import { InstructorBannerManager } from "@/components/instructor/banner-manager";
import { SubmissionEvaluator } from "@/components/instructor/submission-evaluator";
import { DEFAULT_STUDENT } from "@/lib/users";

interface InstructorLessonPageProps {
  lessonId: string;
}

export function InstructorLessonPage({ lessonId }: InstructorLessonPageProps) {
  const {
    lesson,
    content,
    bannerUrl,
    isSaving,
    saveError,
    publishLesson,
    updateBanner,
  } = useLessonEditorStore();

  const [publishStatus, setPublishStatus] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [showSaveError, setShowSaveError] = useState(false);

  // Monitor save errors
  useEffect(() => {
    if (saveError) {
      setShowSaveError(true);
      const timer = setTimeout(() => setShowSaveError(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [saveError]);

  const handlePublish = async () => {
    setIsPublishing(true);
    setPublishStatus(null);
    try {
      await publishLesson();
      setPublishStatus("Lesson published successfully!");
      setTimeout(() => setPublishStatus(null), 3000);
    } catch (error) {
      console.error("Publish failed:", error);
      setPublishStatus("Failed to publish lesson. Please try again.");
    } finally {
      setIsPublishing(false);
    }
  };

  const handleBannerUpdate = async (url: string) => {
    try {
      await updateBanner(url);
    } catch (error) {
      console.error("Banner update failed:", error);
    }
  };

  if (!lesson) {
    return null;
  }

  return (
    <div
      className="min-h-screen text-white"
      style={{ backgroundColor: "#0f1923" }}
    >
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="text-sm text-stone-400 uppercase tracking-widest mb-1">
              Module 1
            </p>
            <h1 className="text-2xl font-serif text-white">
              {lesson.title}
            </h1>
          </div>
          <div className="flex items-center gap-4">
            {publishStatus && (
              <span
                className={`text-sm ${
                  publishStatus.includes("successfully")
                    ? "text-emerald-400"
                    : "text-red-400"
                }`}
              >
                {publishStatus}
              </span>
            )}
            <button
              onClick={handlePublish}
              disabled={isPublishing || isSaving}
              className="px-5 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black text-sm font-medium rounded-lg transition-colors"
            >
              {isPublishing ? "Publishing…" : "Publish Lesson"}
            </button>
          </div>
        </div>

        {/* Save Error Alert */}
        {showSaveError && saveError && (
          <div className="mb-6 p-4 bg-red-900/30 border border-red-700 rounded-lg text-red-200 text-sm">
            <span className="font-medium">Save Error:</span> {saveError}
          </div>
        )}

        {/* Saving Indicator */}
        {isSaving && (
          <div className="mb-6 p-3 bg-blue-900/30 border border-blue-700 rounded-lg text-blue-200 text-sm flex items-center gap-2">
            <div className="h-4 w-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            Saving changes...
          </div>
        )}

        {/* Banner Manager */}
        <InstructorBannerManager
          bannerUrl={bannerUrl}
          onUpdateBanner={handleBannerUpdate}
        />

        {/* Main Content Grid */}
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Editor Panel */}
          <div className="lg:col-span-2">
            <LessonTailorEditor
              content={content}
              onChange={() => {
                // Changes are now handled by store actions
                // The editor will dispatch async actions to the store
              }}
            />
          </div>

          {/* Sidebar */}
          <div className="flex flex-col gap-6">
            <StudentContextPanel
              studentName={DEFAULT_STUDENT.fullName}
              profile={DEFAULT_STUDENT.profile}
            />
            <SubmissionEvaluator
              lessonId={lessonId}
              studentName={DEFAULT_STUDENT.fullName}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
