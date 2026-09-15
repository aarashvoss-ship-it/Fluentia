"use client";

import React from "react";

function renderInline(text: string, keyPrefix: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={key}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*")) return <em key={key}>{part.slice(1, -1)}</em>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={key} className="rounded bg-black/20 px-1 py-0.5 text-amber-200">{part.slice(1, -1)}</code>;
    return <React.Fragment key={key}>{part}</React.Fragment>;
  });
}

export function MarkdownContent({ value, className = "" }: { value: string; className?: string }) {
  const lines = value.split(/\r?\n/);
  const elements: React.ReactNode[] = [];
  let bullets: string[] = [];

  const flushBullets = () => {
    if (bullets.length === 0) return;
    elements.push(<ul key={`list-${elements.length}`} className="my-2 list-disc space-y-1 pl-5">{bullets.map((item, index) => <li key={`item-${index}`}>{renderInline(item, `bullet-${index}`)}</li>)}</ul>);
    bullets = [];
  };

  lines.forEach((line, index) => {
    const bullet = line.match(/^\s*-\s+(.+)$/);
    if (bullet) {
      bullets.push(bullet[1]);
      return;
    }
    flushBullets();
    if (!line.trim()) {
      elements.push(<div key={`space-${index}`} className="h-2" aria-hidden="true" />);
    } else if (line.startsWith("## ")) {
      elements.push(<h3 key={`heading-2-${index}`} className="mt-3 text-lg font-semibold text-stone-100">{renderInline(line.slice(3), `heading-2-${index}`)}</h3>);
    } else if (line.startsWith("# ")) {
      elements.push(<h2 key={`heading-1-${index}`} className="mt-4 text-2xl font-semibold text-stone-100">{renderInline(line.slice(2), `heading-1-${index}`)}</h2>);
    } else {
      elements.push(<p key={`paragraph-${index}`} className="whitespace-pre-wrap">{renderInline(line, `paragraph-${index}`)}</p>);
    }
  });
  flushBullets();

  return <div className={className}>{elements}</div>;
}
