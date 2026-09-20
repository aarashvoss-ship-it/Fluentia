"use client";

import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";

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
          p: ({ children }) => <p className="mb-4 whitespace-pre-wrap leading-7 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="mb-4 mt-2 list-disc space-y-1 pl-5 leading-7">{children}</ul>,
          ol: ({ children }) => <ol className="mb-4 mt-2 list-decimal space-y-1 pl-5 leading-7">{children}</ol>,
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
