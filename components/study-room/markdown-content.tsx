"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function MarkdownContent({ value, className = "" }: { value: string; className?: string }) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h2 className="mt-4 text-2xl font-semibold text-stone-100">{children}</h2>,
          h2: ({ children }) => <h3 className="mt-3 text-lg font-semibold text-stone-100">{children}</h3>,
          h3: ({ children }) => <h4 className="mt-3 text-base font-semibold text-stone-100">{children}</h4>,
          p: ({ children }) => <p className="whitespace-pre-wrap">{children}</p>,
          ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
          blockquote: ({ children }) => <blockquote className="my-2 border-l-2 border-amber-500/50 pl-3 italic text-amber-100/80">{children}</blockquote>,
          hr: () => <hr className="my-4 border-[#394252]" />,
          code: ({ children }) => <code className="rounded bg-black/20 px-1 py-0.5 text-amber-200">{children}</code>,
        }}
      >
        {value}
      </ReactMarkdown>
    </div>
  );
}
