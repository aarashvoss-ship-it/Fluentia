"use client";

import { useEffect, useRef, useState } from "react";
import {
  STUDENT_PREVIEW_CHANNEL,
  StudentStudyRoomPreview,
  type StudentPreviewSnapshot,
  type StudentPreviewStep,
} from "@/components/instructor/student-study-room-preview";

export function LiveStudentPreviewWindow() {
  const [snapshot, setSnapshot] = useState<StudentPreviewSnapshot | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    if (!("BroadcastChannel" in window)) return;
    const channel = new BroadcastChannel(STUDENT_PREVIEW_CHANNEL);
    channelRef.current = channel;
    channel.onmessage = (event: MessageEvent<{ type?: string; snapshot?: StudentPreviewSnapshot }>) => {
      if (event.data?.type === "preview-state" && event.data.snapshot) {
        setSnapshot(event.data.snapshot);
        document.title = `${event.data.snapshot.title || "Lesson"} - Student Preview`;
      }
    };
    channel.postMessage({ type: "preview-ready" });
    return () => {
      channel.close();
      if (channelRef.current === channel) channelRef.current = null;
    };
  }, []);

  const handleStepChange = (step: StudentPreviewStep) => {
    setSnapshot((current) => current ? { ...current, step } : current);
    channelRef.current?.postMessage({ type: "preview-step", step });
  };

  if (!snapshot) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0c1017] px-5 text-center text-stone-300">
        <div>
          <h1 className="text-lg font-semibold text-stone-100">Waiting for Lesson Builder</h1>
          <p className="mt-2 text-sm text-stone-500">Keep the builder open to stream unsaved changes into this preview.</p>
        </div>
      </main>
    );
  }

  return <StudentStudyRoomPreview {...snapshot} onStepChange={handleStepChange} />;
}
