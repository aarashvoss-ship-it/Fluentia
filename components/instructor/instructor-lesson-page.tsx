"use client";

import { useState } from "react";
import { MOCK_INSTRUCTOR_LESSONS } from "@/lib/mock-instructor-data";
import { StudentContextPanel } from "@/components/instructor/student-context-panel";
import { LessonTailorEditor } from "@/components/instructor/lesson-tailor-editor";
import { InstructorBannerManager } from "@/components/instructor/banner-manager";
import { SubmissionEvaluator } from "@/components/instructor/submission-evaluator";

export function InstructorLessonPage({ lessonId }: { lessonId: string }) {
  const initialLesson =
    MOCK_INSTRUCTOR_LESSONS[lessonId] ?? MOCK_INSTRUCTOR_LESSONS["habits-01"];

  const [lessonContent, setLessonContent] = useState(
    initialLesson.content ?? {}
  );
  const [bannerUrl, setBannerUrl] = useState(initialLesson.bannerUrl ?? "");
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishStatus, setPublishStatus] = useState<string | null>(null);

  const handlePublish = () => {
    setIsPublishing(true);
    setPublishStatus(null);
    setTimeout(() => {
      setIsPublishing(false);
      setPublishStatus("Lesson published successfully.");
    }, 1500);
  };

  return (
    <div
      className="min-h-screen text-white"
      style={{ backgroundColor: "#0f1923" }}
    >
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="text-sm text-stone-400 uppercase tracking-widest mb-1">
              Module {initialLesson.moduleNumber}
            </p>
            <h1 className="text-2xl font-serif text-white">
              {initialLesson.title}
            </h1>
          </div>
          <div className="flex items-center gap-4">
            {publishStatus && (
              <span className="text-sm text-emerald-400">{publishStatus}</span>
            )}
            <button
              onClick={handlePublish}
              disabled={isPublishing}
              className="px-5 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black text-sm font-medium rounded-lg transition-colors"
            >
              {isPublishing ? "Publishing…" : "Publish Lesson"}
            </button>
          </div>
        </div>

        <InstructorBannerManager
          bannerUrl={bannerUrl}
          onUpdateBanner={setBannerUrl}
        />

        <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <LessonTailorEditor
              content={lessonContent}
              onChange={setLessonContent}
            />
          </div>
          <div className="flex flex-col gap-6">
            <StudentContextPanel
              studentName={initialLesson.studentName}
              profile={initialLesson.studentProfile}
            />
            <SubmissionEvaluator
              lessonId={lessonId}
              studentName={initialLesson.studentName}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
