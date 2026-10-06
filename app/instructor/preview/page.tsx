"use client";

import dynamic from "next/dynamic";

const LiveStudentPreviewWindow = dynamic(
  () => import("@/components/instructor/live-student-preview-window").then((module) => module.LiveStudentPreviewWindow),
  {
    ssr: false,
    loading: () => <main className="flex min-h-screen items-center justify-center bg-background text-sm text-stone-400">Loading live preview...</main>,
  },
);

export default function InstructorLivePreviewPage() {
  return <LiveStudentPreviewWindow />;
}
