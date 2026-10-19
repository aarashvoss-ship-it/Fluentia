"use client";

import { useState } from "react";

interface ImageBlockRendererProps {
  imageUrl: string;
  title?: string;
  caption?: string;
}

export function ImageBlockRenderer({ imageUrl, title, caption }: ImageBlockRendererProps) {
  const [failedImageUrl, setFailedImageUrl] = useState<string>();

  if (!imageUrl || failedImageUrl === imageUrl) {
    return failedImageUrl === imageUrl ? (
      <p role="status" className="rounded-lg border border-dashed border-border p-4 text-xs text-stone-500">
        Image unavailable{caption || title ? ` — ${caption || title}` : ""}
      </p>
    ) : null;
  }

  return (
    <figure className="overflow-hidden rounded-lg border border-border bg-background">
      <img
        src={imageUrl}
        alt={caption || title || "Lesson image"}
        className="block h-auto w-full max-w-full object-contain"
        onError={() => setFailedImageUrl(imageUrl)}
      />
      {caption && (
        <figcaption className="border-t border-border px-4 py-3 text-sm leading-relaxed text-stone-400">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
