"use client";

import React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import { isFillInBlankAnswerCorrect } from "@/lib/fill-in-blanks";

const DEFAULT_ANSWER = "";
const BRACKET_PATTERN = /\[([^\]]+)\]/g;

type FillInBlanksMarkdownProps = {
  blockId: string;
  text: string;
  acceptableAnswers: string[][];
  wordBank?: string[];
  caseSensitive?: boolean;
  values: Record<string, string>;
  onChange?: (blankIndex: number, value: string) => void;
  readOnly?: boolean;
  showFeedback?: boolean;
  showResults?: boolean;
  className?: string;
};

export function FillInBlanksMarkdown({
  blockId,
  text,
  acceptableAnswers,
  wordBank = [],
  caseSensitive = false,
  values,
  onChange,
  readOnly = false,
  showFeedback = false,
  showResults = false,
  className = "",
}: FillInBlanksMarkdownProps) {
  let globalBlankIndex = 0;
  const blankAnswers = Array.from(text.matchAll(BRACKET_PATTERN), (match) =>
    match[1].trim().replace(/^blank\s*:\s*/i, "").trim(),
  );
  let replacementIndex = 0;
  const markdownWithInputs = text.replace(BRACKET_PATTERN, () => {
    const index = replacementIndex++;
    return `<input data-fill-blank-index="${index}" />`;
  });

  const renderInput = (blankIndex: number) => {
    const answer = blankAnswers[blankIndex] || "";
    const responseKey = `${blockId}-blank-${blankIndex}`;
    const acceptable = acceptableAnswers[blankIndex]?.length ? acceptableAnswers[blankIndex] : [answer || DEFAULT_ANSWER];
    const response = values[responseKey] || "";
    const shouldShowFeedback = showResults && showFeedback && !readOnly;
    const isCorrect = shouldShowFeedback && response.trim().length > 0 && isFillInBlankAnswerCorrect(response, acceptable, caseSensitive);
    return <React.Fragment key={responseKey}><input type="text" value={response} onChange={(event) => onChange?.(blankIndex, event.target.value)} onDragOver={(event) => { if (!readOnly) event.preventDefault(); }} onDrop={(event) => { if (readOnly) return; event.preventDefault(); const droppedWord = event.dataTransfer.getData("text/plain").trim(); if (droppedWord) onChange?.(blankIndex, droppedWord); }} readOnly={readOnly} disabled={readOnly} placeholder={readOnly ? answer || "answer" : "Drop or type"} aria-label={`Blank ${blankIndex + 1}`} className={`mx-1 inline-block min-w-24 max-w-full border-b-2 bg-transparent px-2 py-0.5 text-center align-baseline text-inherit text-stone-100 outline-none focus:border-amber-300 ${shouldShowFeedback ? (isCorrect ? "border-emerald-400" : "border-red-400") : "border-amber-500"}`} data-acceptable-answer-count={acceptable.length} />{shouldShowFeedback && <span className={`text-xs ${isCorrect ? "text-emerald-300" : "text-red-300"}`}>{isCorrect ? "Correct" : "Incorrect"}</span>}</React.Fragment>;
  };

  const components: Components = {
    h1: ({ children }) => <h1 className="mb-4 mt-6 text-2xl font-semibold leading-tight text-stone-100">{children}</h1>,
    h2: ({ children }) => <h2 className="mb-3 mt-5 text-lg font-semibold leading-tight text-stone-100">{children}</h2>,
    h3: ({ children }) => <h3 className="mb-3 mt-4 text-base font-semibold leading-tight text-stone-100">{children}</h3>,
    p: ({ children }) => <p className="mb-4 whitespace-pre-wrap leading-7 last:mb-0">{children}</p>,
    ul: ({ children }) => <ul className="mb-4 mt-2 list-disc space-y-1 pl-5 leading-7">{children}</ul>,
    ol: ({ children }) => <ol className="mb-4 mt-2 list-decimal space-y-1 pl-5 leading-7">{children}</ol>,
    li: ({ children }) => <li className="pl-1 text-slate-300">{children}</li>,
    strong: ({ children }) => <strong className="font-semibold text-amber-400">{children}</strong>,
    em: ({ children }) => <em className="italic text-stone-200">{children}</em>,
    code: ({ children }) => <code className="rounded border border-[#394252] bg-[#0c1017] px-1.5 py-0.5 font-mono text-xs text-amber-200">{children}</code>,
    a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer" className="text-amber-300 underline decoration-amber-500/40 underline-offset-2 hover:text-amber-200">{children}</a>,
    input: ({ node }) => {
      const properties = (node as unknown as { properties?: { dataFillBlankIndex?: number | string } }).properties;
      const blankIndex = Number(properties?.dataFillBlankIndex ?? globalBlankIndex++);
      return renderInput(blankIndex);
    },
  };

  return (
    <div className={className}>
      {text
        ? <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={components}>{markdownWithInputs}</ReactMarkdown>
        : <p className="text-stone-500">Nothing to preview yet.</p>}
      {wordBank.length > 0 && <div className="mt-4 border-t border-[#394252] pt-3"><p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-amber-400">Word Bank</p><div className="flex flex-wrap gap-2" aria-label="Fill in the blanks word bank">{wordBank.map((word, wordIndex) => <button key={`${word}-${wordIndex}`} type="button" draggable={!readOnly} onDragStart={(event) => { if (!readOnly) event.dataTransfer.setData("text/plain", word); }} disabled={readOnly} className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200 transition hover:border-amber-400 hover:bg-amber-500/20 disabled:cursor-default disabled:opacity-70">{word}</button>)}</div><p className="mt-2 text-[11px] text-stone-500">Drag a word onto a blank, or type your answer.</p></div>}
    </div>
  );
}
