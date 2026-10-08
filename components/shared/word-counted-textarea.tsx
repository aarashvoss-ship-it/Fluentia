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
    <div className="relative">
      <textarea
        value={value}
        onChange={handleChange}
        rows={rows}
        placeholder={placeholder}
        readOnly={readOnly}
        className={`${className}${counterEnabled ? " pb-8" : ""}`}
        aria-label={ariaLabel}
      />
      {counterEnabled && (
        <span
          className={`pointer-events-none absolute bottom-2 right-3 text-[11px] font-medium ${getCounterColor(wordCount, config)}`}
          aria-live="polite"
        >
          {wordCount}{maxWords !== undefined && maxWords > 0 ? ` / ${maxWords}` : ""} words
        </span>
      )}
    </div>
  );
}
