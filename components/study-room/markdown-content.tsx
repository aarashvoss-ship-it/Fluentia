"use client";

import React, { type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import { CheckCircle2, XCircle } from "lucide-react";

function renderTextTokens(value: string): ReactNode {
  const parts = value.split(/(\[[^\[\]\n]+\])/g);
  return parts.map((part, index) => {
    if (/^\[[^\[\]\n]+\]$/.test(part)) {
      return <span key={`${part}-${index}`} className="mx-0.5 inline-flex rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-mono text-sm text-amber-300">{part}</span>;
    }
    return <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>;
  });
}

function getTextContent(children: ReactNode): string {
  return React.Children.toArray(children).map((child) => typeof child === "string" ? child : "").join("").trim();
}

function renderComparison(children: ReactNode) {
  const text = getTextContent(children);
  const match = text.match(/^(Before|Incorrect|After|Preferred)\s*:\s*/i);
  if (!match) return null;
  const isBefore = /^(Before|Incorrect)/i.test(match[1]);
  const label = isBefore ? "Before / Incorrect" : "After / Preferred";
  const badgeClass = isBefore
    ? "bg-red-500/10 text-red-400 border border-red-500/20"
    : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
  return { label, badgeClass, prefixLength: match[0].length };
}

export function MarkdownContent({ value, className = "" }: { value: string; className?: string }) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          h1: ({ children }) => <h1 className="mb-4 mt-6 text-2xl font-semibold leading-tight text-stone-100">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-3 mt-5 text-lg font-semibold leading-tight text-stone-100">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-3 mt-4 text-base font-semibold leading-tight text-stone-100">{children}</h3>,
          h4: ({ children }) => <h4 className="mb-2 mt-4 text-sm font-semibold leading-snug text-stone-100">{children}</h4>,
          h5: ({ children }) => <h5 className="mb-2 mt-3 text-sm font-semibold leading-snug text-stone-200">{children}</h5>,
          h6: ({ children }) => <h6 className="mb-2 mt-3 text-xs font-semibold leading-snug text-stone-300">{children}</h6>,
          text: ({ children }) => <>{renderTextTokens(String(children))}</>,
          p: ({ children }) => {
            const comparison = renderComparison(children);
            if (!comparison) return <p className="mb-4 whitespace-pre-wrap leading-7 last:mb-0">{children}</p>;
            const text = getTextContent(children);
            return <p className="mb-4 whitespace-pre-wrap leading-7 last:mb-0"><span className={`mr-2 inline-flex rounded px-2 py-0.5 text-xs font-semibold ${comparison.badgeClass}`}>{comparison.label}</span>{renderTextTokens(text.slice(comparison.prefixLength))}</p>;
          },
          ul: ({ children }) => <ul className="mb-4 mt-2 list-none space-y-1 pl-0 leading-7">{children}</ul>,
          ol: ({ children }) => <ol className="mb-4 mt-2 list-decimal space-y-1 pl-5 leading-7">{children}</ol>,
          li: ({ children }) => {
            const text = getTextContent(children);
            const marker = text.match(/^(❌|✅)\s*/);
            if (!marker) return <li>{children}</li>;
            const isSuccess = marker[1] === "✅";
            const Icon = isSuccess ? CheckCircle2 : XCircle;
            return <li className="flex items-start gap-2"><Icon className={`mt-1 h-4 w-4 shrink-0 ${isSuccess ? "text-emerald-400" : "text-red-400"}`} aria-hidden="true" />{renderTextTokens(text.slice(marker[0].length))}</li>;
          },
          blockquote: ({ children }) => <blockquote className="my-4 border-l-4 border-amber-500/70 bg-amber-500/10 px-4 py-2 leading-7 italic text-amber-100/90">{children}</blockquote>,
          hr: () => <hr className="my-5 border-[#394252]" />,
          pre: ({ children }) => <pre className="mb-4 max-w-full overflow-x-auto rounded-lg border border-white/10 bg-black/30 p-3 text-sm leading-6 text-stone-200">{children}</pre>,
          code: ({ className, children, ...props }) => {
            const isBlock = Boolean(className) || String(children).includes("\n");
            return isBlock ? (
              <code className="block whitespace-pre-wrap break-words font-mono text-sm text-cyan-100" {...props}>{children}</code>
            ) : (
              <code className="break-words rounded bg-black/30 px-1.5 py-0.5 font-mono text-[0.9em] text-amber-200" {...props}>{children}</code>
            );
          },
        }}
      >
        {value}
      </ReactMarkdown>
    </div>
  );
}
