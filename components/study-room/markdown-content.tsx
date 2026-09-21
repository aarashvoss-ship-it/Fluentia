"use client";

import React, { type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import { CheckCircle2, XCircle } from "lucide-react";

const parseBracketsToBadges = (content: string) => {
  if (!content) return "";
  return content.replace(
    /\[([^\]]+)\]/g,
    '<span class="inline-flex items-center px-2 py-0.5 rounded text-sm font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono my-0.5">$1</span>'
  );
};

function renderTextTokens(value: string): ReactNode {
  const tokenPattern = /\[(.*?)\]/g;
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let tokenIndex = 0;
  while ((match = tokenPattern.exec(value)) !== null) {
    if (match.index > lastIndex) nodes.push(<React.Fragment key={`text-${tokenIndex++}`}>{value.slice(lastIndex, match.index)}</React.Fragment>);
    nodes.push(<span key={`token-${tokenIndex++}`} className="mx-0.5 inline-block rounded border border-amber-500/30 bg-amber-400/20 px-1.5 py-0.5 font-semibold text-amber-300">{match[1]}</span>);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < value.length) nodes.push(<React.Fragment key={`text-${tokenIndex}`}>{value.slice(lastIndex)}</React.Fragment>);
  return nodes.length ? nodes : value;
}

function getTextContent(children: ReactNode): string {
  return React.Children.toArray(children).map((child) => typeof child === "string" ? child : "").join("").trim();
}

function splitListMarker(children: ReactNode) {
  const childNodes = React.Children.toArray(children);
  const firstTextIndex = childNodes.findIndex((child) => typeof child === "string");
  if (firstTextIndex < 0 || typeof childNodes[firstTextIndex] !== "string") return null;
  const firstText = childNodes[firstTextIndex] as string;
  const marker = firstText.match(/^(❌|✅)\s*/);
  if (!marker) return null;
  const isSuccess = marker[1] === "✅";
  childNodes[firstTextIndex] = firstText.slice(marker[0].length);
  return { isSuccess, children: childNodes };
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

function normalizeMarkdown(value: string) {
  const normalized = value.replace(/\\n/g, "\n").trim();
  if (normalized.startsWith('"') && normalized.endsWith('"')) {
    return normalized.slice(1, -1).replace(/\\"/g, '"');
  }
  return normalized;
}

export function MarkdownContent({ value, className = "", plainCode = false }: { value: string; className?: string; plainCode?: boolean }) {
  const renderPlainCode = plainCode || className.includes("text-slate-300");
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
          strong: ({ children }) => <strong className="font-semibold text-amber-400">{children}</strong>,
          p: ({ children }) => {
            const comparison = renderComparison(children);
            if (!comparison) return <p className="mb-4 whitespace-pre-wrap leading-7 last:mb-0">{children}</p>;
            const text = getTextContent(children);
            return <p className="mb-4 whitespace-pre-wrap leading-7 last:mb-0"><span className={`mr-2 inline-flex rounded px-2 py-0.5 text-xs font-semibold ${comparison.badgeClass}`}>{comparison.label}</span>{renderTextTokens(text.slice(comparison.prefixLength))}</p>;
          },
          ul: ({ children }) => <ul className="mb-4 mt-2 list-disc space-y-1 pl-5 leading-7">{children}</ul>,
          ol: ({ children }) => <ol className="mb-4 mt-2 list-decimal space-y-1 pl-5 leading-7">{children}</ol>,
          li: ({ children }) => {
            const markedChildren = splitListMarker(children);
            if (!markedChildren) return <li className="pl-1 text-slate-300">{children}</li>;
            const { isSuccess } = markedChildren;
            const Icon = isSuccess ? CheckCircle2 : XCircle;
            return <li className="flex items-start gap-2"><Icon className={`mt-1 h-4 w-4 shrink-0 ${isSuccess ? "text-emerald-400" : "text-red-400"}`} aria-hidden="true" /><span className="min-w-0">{markedChildren.children}</span></li>;
          },
          blockquote: ({ children }) => <blockquote className="my-4 border-l-4 border-amber-500/70 bg-amber-500/10 px-4 py-2 leading-7 italic text-amber-100/90">{children}</blockquote>,
          hr: () => <hr className="my-5 border-[#394252]" />,
          pre: ({ children }) => renderPlainCode
            ? <p className="mb-4 whitespace-pre-wrap leading-7 last:mb-0">{children}</p>
            : <pre className="mb-4 max-w-full overflow-x-auto rounded-lg border border-white/10 bg-black/30 p-3 text-sm leading-6 text-stone-200">{children}</pre>,
          code: ({ className, children, ...props }) => {
            if (renderPlainCode) return <span {...props}>{children}</span>;
            const isBlock = Boolean(className) || String(children).includes("\n");
            return isBlock ? (
              <code className="block whitespace-pre-wrap break-words font-mono text-sm text-cyan-100" {...props}>{children}</code>
            ) : (
              <code className="break-words rounded bg-black/30 px-1.5 py-0.5 font-mono text-[0.9em] text-amber-200" {...props}>{children}</code>
            );
          },
        }}
      >
        {parseBracketsToBadges(normalizeMarkdown(value))}
      </ReactMarkdown>
    </div>
  );
}
