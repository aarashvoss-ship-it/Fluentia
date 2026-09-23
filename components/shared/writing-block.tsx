"use client";

import { useEffect, useRef } from "react";
import { MarkdownContent } from "@/components/study-room/markdown-content";
import type { WritingContentBlock } from "@/types/lesson";

export interface WritingBlockEditorProps {
  block: WritingContentBlock;
  onChange: (changes: Partial<WritingContentBlock>) => void;
}

export function WritingBlockEditor({ block, onChange }: WritingBlockEditorProps) {
  return (
    <div className="space-y-3">
      <label className="block text-xs text-stone-500">
        Prompt title
        <input
          value={block.title}
          onChange={(event) => onChange({ title: event.target.value })}
          placeholder="Writing prompt title"
          className="mt-1 w-full rounded border border-[#202631] bg-[#0c1017] p-2 text-xs text-stone-200 outline-none focus:border-amber-500"
        />
      </label>
      <label className="block text-xs text-stone-500">
        Instructions (Markdown supported)
        <textarea
          value={block.prompt}
          onChange={(event) => onChange({ prompt: event.target.value })}
          placeholder="Describe the writing task and any requirements..."
          rows={6}
          className="mt-1 w-full resize-y rounded border border-[#202631] bg-[#0c1017] p-2 text-xs text-stone-200 outline-none focus:border-amber-500"
          aria-label="Writing prompt instructions"
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs text-stone-500">
          Minimum word count
          <input
            type="number"
            min={0}
            value={block.minWordCount}
            onChange={(event) => onChange({ minWordCount: Math.max(0, Number(event.target.value) || 0) })}
            className="mt-1 w-full rounded border border-[#202631] bg-[#0c1017] p-2 text-xs text-stone-200 outline-none focus:border-amber-500"
          />
        </label>
        <label className="block text-xs text-stone-500">
          Maximum word count
          <input
            type="number"
            min={0}
            value={block.maxWordCount}
            onChange={(event) => onChange({ maxWordCount: Math.max(0, Number(event.target.value) || 0) })}
            className="mt-1 w-full rounded border border-[#202631] bg-[#0c1017] p-2 text-xs text-stone-200 outline-none focus:border-amber-500"
          />
        </label>
      </div>
      <label className="block text-xs text-stone-500">
        Guidance / model answer notes (optional)
        <textarea
          value={block.guidance || ""}
          onChange={(event) => onChange({ guidance: event.target.value })}
          placeholder="Private guidance for evaluation or a model answer..."
          rows={4}
          className="mt-1 w-full resize-y rounded border border-[#202631] bg-[#0c1017] p-2 text-xs text-stone-200 outline-none focus:border-amber-500"
          aria-label="Writing guidance or model answer notes"
        />
      </label>
      <div className="rounded border border-[#202631] bg-[#0c1017]/50 p-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-400">Student preview</p>
        <MarkdownContent value={block.prompt || "Writing instructions will appear here."} className="text-sm leading-relaxed text-stone-300" />
        <WritingBlockRenderer block={block} value="" isPreview />
      </div>
    </div>
  );
}

export interface WritingBlockRendererProps {
  block: Pick<WritingContentBlock, "id" | "prompt" | "minWordCount" | "maxWordCount">;
  value?: string;
  onChange?: (value: string) => void;
  isPreview?: boolean;
  className?: string;
}

function countWords(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export function WritingBlockRenderer({ block, value = "", onChange, isPreview = false, className = "" }: WritingBlockRendererProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const wordCount = countWords(value);
  const characterCount = value.length;
  const minimumReached = wordCount >= block.minWordCount;
  const overMaximum = block.maxWordCount > 0 && wordCount > block.maxWordCount;

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.max(textarea.scrollHeight, 180)}px`;
  }, [value]);

  return (
    <div className={`mt-4 space-y-2 ${className}`}>
      {!isPreview && <MarkdownContent value={block.prompt || "Writing prompt"} className="text-sm leading-relaxed text-stone-300" />}
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={value}
          readOnly={isPreview}
          onChange={(event) => onChange?.(event.target.value)}
          placeholder={isPreview ? "Student essay response" : "Start writing your response..."}
          className="min-h-[180px] w-full resize-none overflow-hidden rounded-lg border border-[#202631] bg-[#0c1017] p-4 pb-12 text-sm leading-7 text-stone-200 outline-none transition focus:border-amber-500 read-only:cursor-default read-only:opacity-80"
          aria-label="Writing response"
        />
        <div className="pointer-events-none absolute bottom-3 right-3 flex flex-wrap justify-end gap-x-3 gap-y-1 text-[11px] tabular-nums text-stone-500">
          <span className={minimumReached ? "text-amber-300" : ""}>{wordCount} / {block.minWordCount} words</span>
          <span>{characterCount} characters</span>
          {overMaximum && <span className="text-red-300">Maximum exceeded</span>}
        </div>
      </div>
    </div>
  );
}
