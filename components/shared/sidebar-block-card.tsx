"use client";

import { useState } from "react";
import { DynamicLucideIcon } from "@/components/shared/lucide-icon-picker";
import { MarkdownContent } from "@/components/study-room/markdown-content";

export function SidebarBlockCard({
  title,
  body,
  icon,
  imageUrl,
  altText,
}: {
  title: string;
  body: string;
  icon?: string;
  imageUrl?: string;
  altText?: string;
}) {
  const [failedImageUrl, setFailedImageUrl] = useState<string>();
  const imageFailed = Boolean(imageUrl && failedImageUrl === imageUrl);

  return (
    <article className="h-auto min-h-fit w-full shrink-0 rounded-xl border border-border bg-surface">
      {imageUrl && !imageFailed && (
        <div className="h-auto min-h-fit w-full bg-background">
          <img
            src={imageUrl}
            alt={altText || ""}
            loading="lazy"
            onError={() => setFailedImageUrl(imageUrl)}
            className="h-auto w-full max-w-full object-contain"
          />
        </div>
      )}
      <div className="min-w-0 p-4">
        {title.trim() && title.trim() !== "Sidebar note" && (
          <div className="flex min-w-0 items-start gap-2">
            {icon && <DynamicLucideIcon name={icon} className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />}
            <MarkdownContent value={title} className="min-w-0 text-xs font-semibold text-amber-400 [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-xs [&_p]:m-0" />
          </div>
        )}
        {imageFailed && <p className="text-xs text-stone-500">Image could not be loaded.</p>}
        {body && <MarkdownContent value={body} className="mt-2 text-sm leading-relaxed text-stone-300" />}
        {imageUrl && altText?.trim() && <p className="mt-2 text-xs leading-relaxed text-stone-500">{altText}</p>}
      </div>
    </article>
  );
}
