"use client";

import { useEffect, useId, useState } from "react";
import { ChevronDown, Lock, Unlock } from "lucide-react";
import { MarkdownContent } from "@/components/study-room/markdown-content";

const INTONATION_NOTE = "Note: ALL CAPS indicate key stress points—emphasize them higher while shadowing.";

interface MediaTranscriptAccordionProps {
  transcript?: string;
  isUnlocked: boolean;
  openByDefault?: boolean;
  showIntonationNote?: boolean;
}

export function MediaTranscriptAccordion({
  transcript,
  isUnlocked,
  openByDefault = false,
  showIntonationNote = false,
}: MediaTranscriptAccordionProps) {
  const [isOpen, setIsOpen] = useState(openByDefault);
  const contentId = useId();

  useEffect(() => {
    if (openByDefault) setIsOpen(true);
  }, [openByDefault]);

  if (!isUnlocked) {
    return (
      <div className="group relative mt-4">
        <button
          type="button"
          disabled
          aria-disabled="true"
          className="flex w-full cursor-not-allowed items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-left text-xs text-stone-500 opacity-80"
        >
          <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Transcript
        </button>
        <span role="tooltip" className="pointer-events-none absolute bottom-full left-0 z-10 mb-2 hidden max-w-sm rounded-md border border-border bg-surface px-3 py-2 text-xs leading-relaxed text-stone-300 shadow-xl group-hover:block">
          Transcript locks until lesson submission. Complete all steps to unlock for review.
        </span>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-md border border-amber-500/40 bg-background">
      <button type="button" onClick={() => setIsOpen((open) => !open)} aria-expanded={isOpen} aria-controls={contentId} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-amber-400">
        <Unlock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Transcript
        <ChevronDown className={`ml-auto h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      <div className={`overflow-hidden transition-[max-height,opacity] duration-300 ease-out ${isOpen ? "max-h-[350px] opacity-100" : "max-h-0 opacity-0"}`}>
        <div id={contentId} className="max-h-[350px] overflow-y-auto border-t border-border px-3 py-3 pr-2">
          {showIntonationNote && <p className="mb-3 text-[11px] leading-relaxed text-[#94a3b8]">{INTONATION_NOTE}</p>}
          {transcript?.trim() ? <MarkdownContent value={transcript} className="text-sm leading-relaxed text-stone-300" /> : <p className="text-xs text-stone-500">No transcript was provided for this media.</p>}
        </div>
      </div>
    </div>
  );
}
