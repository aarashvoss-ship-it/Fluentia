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
  caseSensitive?: boolean;
  values: Record<string, string>;
  onChange?: (blankIndex: number, value: string) => void;
  readOnly?: boolean;
  showFeedback?: boolean;
  className?: string;
};

export function FillInBlanksMarkdown({
  blockId,
  text,
  acceptableAnswers,
  caseSensitive = false,
  values,
  onChange,
  readOnly = false,
  showFeedback = false,
  className = "",
}: FillInBlanksMarkdownProps) {
  let globalBlankIndex = 0;
  const blankAnswers = Array.from(text.matchAll(BRACKET_PATTERN), (match) =>
    match[1].trim().replace(/^blank\s*:\s*/i, "").trim(),
  );

  const renderInput = (blankIndex: number) => {
    const answer = blankAnswers[blankIndex] || "";
    const responseKey = `${blockId}-blank-${blankIndex}`;
    const acceptable = acceptableAnswers[blankIndex]?.length ? acceptableAnswers[blankIndex] : [answer || DEFAULT_ANSWER];
    const response = values[responseKey] || "";
    const isCorrect = showFeedback && response.trim().length > 0 && isFillInBlankAnswerCorrect(response, acceptable, caseSensitive);
    return <React.Fragment key={responseKey}><input type="text" value={response} onChange={(event) => onChange?.(blankIndex, event.target.value)} readOnly={readOnly} disabled={readOnly} placeholder={readOnly ? answer || "answer" : "answer"} aria-label={`Blank ${blankIndex + 1}`} className={`mx-1 inline-block min-w-24 max-w-full border-b-2 bg-transparent px-2 py-0.5 text-center align-baseline text-inherit text-stone-100 outline-none focus:border-amber-300 ${isCorrect ? "border-emerald-400" : "border-amber-500"}`} data-acceptable-answer-count={acceptable.length} />{isCorrect && <span className="text-xs text-emerald-300">Correct</span>}</React.Fragment>;
  };

  const renderText = (children: React.ReactNode) => {
    const value = String(children);
    const nodes: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    BRACKET_PATTERN.lastIndex = 0;
    while ((match = BRACKET_PATTERN.exec(value)) !== null) {
      if (match.index > lastIndex) nodes.push(value.slice(lastIndex, match.index));
      nodes.push(renderInput(globalBlankIndex));
      globalBlankIndex += 1;
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < value.length) nodes.push(value.slice(lastIndex));
    return nodes.length ? nodes : children;
  };

  const components: Components = {
    text: ({ children }) => <>{renderText(children)}</>,
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
  };

  return (
    <div className={className}>
      {text
        ? text.split("\n").map((line, lineIndex) => (
            <ReactMarkdown key={`fill-line-${lineIndex}`} remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={components}>
              {line || " "}
            </ReactMarkdown>
          ))
        : <p className="text-stone-500">Nothing to preview yet.</p>}
    </div>
  );
}
