"use client";

import type { ChangeEvent } from "react";
import type { WordCountConfig } from "@/types/lesson";

interface WordCountedTextareaProps {
  value: string;
  onChange: (value: string) => void;
  wordCountConfig?: WordCountConfig;
  rows: number;
  placeholder: string;
  className: string;
  ariaLabel: string;
  readOnly?: boolean;
  saveStatus?: "saving" | "saved" | "unsaved";
  onSaveProgress?: () => void;
}

function countWords(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function limitToWords(value: string, maxWords: number) {
  let wordCount = 0;
  const wordPattern = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = wordPattern.exec(value))) {
    wordCount += 1;
    if (wordCount === maxWords) return value.slice(0, wordPattern.lastIndex);
  }
  return value;
}

function getCounterColor(wordCount: number, config: WordCountConfig) {
  const minWords = config.minWords ?? 0;
  const maxWords = config.maxWords;
  if (maxWords !== undefined && maxWords > 0 && wordCount > maxWords) return "text-red-400";
  if (wordCount < minWords) return wordCount >= Math.max(0, minWords - 10) ? "text-yellow-400" : "text-stone-500";
  return "text-emerald-400";
}

export function WordCountedTextarea({
  value,
  onChange,
  wordCountConfig,
  rows,
  placeholder,
  className,
  ariaLabel,
  readOnly = false,
  saveStatus,
  onSaveProgress,
}: WordCountedTextareaProps) {
  const counterEnabled = wordCountConfig?.enabled === true;
  const config = wordCountConfig ?? { enabled: false };
  const wordCount = countWords(value);
  const maxWords = config.maxWords;
  const hardLimitEnabled = counterEnabled
    && config.enforceHardLimit === true
    && maxWords !== undefined
    && maxWords > 0;

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const nextValue = event.target.value;
    onChange(hardLimitEnabled && maxWords !== undefined && countWords(nextValue) > maxWords
      ? limitToWords(nextValue, maxWords)
      : nextValue);
  };

  return (
    <div className="h-auto min-h-max min-w-0 overflow-visible pb-4">
      <div className="relative h-auto min-h-max min-w-0 overflow-visible">
        <textarea
          value={value}
          onChange={handleChange}
          rows={rows}
          placeholder={placeholder}
          readOnly={readOnly}
          spellCheck={!config.disableSpellcheck}
          autoCorrect={config.disableSpellcheck ? "off" : undefined}
          autoCapitalize={config.disableSpellcheck ? "off" : undefined}
          className={className}
          style={counterEnabled ? { paddingBottom: "2rem" } : undefined}
          aria-label={ariaLabel}
        />
        {counterEnabled && (
          <span
            className={`pointer-events-none text-[11px] font-medium ${getCounterColor(wordCount, config)}`}
            style={{ position: "absolute", bottom: "0.5rem", right: "0.75rem", zIndex: 1 }}
            aria-live="polite"
          >
            {wordCount}{maxWords !== undefined && maxWords > 0 ? ` / ${maxWords}` : ""} words
          </span>
        )}
      </div>
      {saveStatus && (
        <div className="mt-2 flex shrink-0 flex-wrap items-center justify-between gap-2 pb-1">
          <span className={`inline-flex items-center gap-1.5 text-xs ${
            saveStatus === "saving" ? "text-amber-300" : saveStatus === "saved" ? "text-emerald-400" : "text-red-300"
          }`} role="status" aria-live="polite">
            <span aria-hidden="true">●</span>
            {saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "All changes saved" : "Unsaved changes (Local backup kept)"}
          </span>
          {onSaveProgress && (
            <button
              type="button"
              onClick={onSaveProgress}
              className="rounded border border-border px-2.5 py-1 text-xs text-stone-300 transition hover:border-amber-500/50 hover:text-amber-300"
            >
              Save Progress
            </button>
          )}
        </div>
      )}
    </div>
  );
}
