"use client";

import { useState } from "react";
import { StudentContextPanel } from "@/components/instructor/student-context-panel";
import { LessonTailorEditor } from "@/components/instructor/lesson-tailor-editor";
import { InstructorBannerManager } from "@/components/instructor/banner-manager";
import { SubmissionEvaluator } from "@/components/instructor/submission-evaluator";
import { StrictStepContent, StudentProfile } from "@/types/lesson";

export function LessonWorkstationPage({ lessonId }: { lessonId: string }) {
  const initialLesson = {
    studentName: "Student",
    studentProfile: {} as StudentProfile,
    content: {} as StrictStepContent,
    bannerUrl: "",
  };

  const [lessonContent, setLessonContent] = useState<StrictStepContent>(
    initialLesson.content ?? ({} as StrictStepContent)
  );
  const [bannerUrl, setBannerUrl] = useState<string>(
    initialLesson.bannerUrl ?? ""
  );
  const [isPublishing, setIsPublishing] = useState<boolean>(false);
  const [publishStatus, setPublishStatus] = useState<string | null>(null);

  const handlePublish = () => {
    setIsPublishing(true);
    setPublishStatus(null);

    setTimeout(() => {
      setIsPublishing(false);
      setPublishStatus("Updates successfully synced with student view!");
      setTimeout(() => setPublishStatus(null), 4000);
    }, 800);
  };

  return (
    <div className="min-h-screen bg-[#0d1520] text-[#d4e4fa] p-4 md:p-8 font-sans">
      <header className="max-w-7xl mx-auto mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#273647] pb-4">
        <div>
          <span className="text-xs font-mono text-[#ffc66b] uppercase tracking-wider">
            Fluentia Instructor Studio
          </span>
          <h1 className="text-2xl font-bold text-white mt-1">
            Lesson Workstation
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {publishStatus && (
            <span className="text-xs text-[#9dc4e8] bg-[#122131] px-3 py-1.5 rounded-lg border border-[#273647]">
              {publishStatus}
            </span>
          )}
          <button
            onClick={handlePublish}
            disabled={isPublishing}
            className="bg-[#ffc66b] hover:bg-[#e5b25f] text-[#122131] font-semibold text-xs px-5 py-2.5 rounded-lg transition shadow disabled:opacity-50"
          >
            {isPublishing ? "Publishing..." : "Publish Lesson Updates"}
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 space-y-6">
          <LessonTailorEditor
            content={lessonContent}
            onChange={(updatedContent: StrictStepContent) =>
              setLessonContent(updatedContent)
            }
          />
        </div>

        <div className="lg:col-span-5 space-y-6">
          <InstructorBannerManager
            bannerUrl={bannerUrl}
            onUpdateBanner={(url: string) => setBannerUrl(url)}
          />

          <StudentContextPanel
            studentName={initialLesson.studentName}
            profile={initialLesson.studentProfile}
          />

          <SubmissionEvaluator
            lessonId={lessonId}
            studentName={initialLesson.studentName}
          />
        </div>
      </main>
    </div>
  );
}
