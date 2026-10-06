"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, Download, X } from "lucide-react";
import { CustomAudioPlayer } from "@/components/study-room/custom-audio-player";
import { InteractiveVideoBlock } from "@/components/shared/interactive-video-block";
import { DataTableResource, getDataTableResourceTitle, isDataTableResourceTitle } from "@/components/shared/data-table-resource";
import { MarkdownContent } from "@/components/study-room/markdown-content";
import { StudyHubMarkdownResource } from "@/components/shared/study-hub-markdown-resource";

export type StudyHubResourceType = "note" | "reading" | "flashcard" | "flashcards" | "quiz" | "audio" | "data_table" | "file" | "image" | "video";

export type StudyHubResource = {
  id: string;
  lesson_id?: string | null;
  resource_type: StudyHubResourceType;
  title: string;
  body?: string | null;
  bodyHtml?: string | null;
  link_url?: string | null;
  question?: string | null;
  answer?: string | null;
  explanation?: string | null;
  subtitle?: string | null;
  sub_title?: string | null;
  example?: string | null;
  cards?: { id?: string; front: string; back: string; explanation?: string }[] | null;
  original_filename?: string | null;
  media_type?: string | null;
  storage_path?: string | null;
  is_external_url?: boolean;
  created_at?: string | null;
};

export type StudyHubFlashcard = {
  id?: string;
  question: string;
  answer: string;
  explanation?: string;
};

export function getStudyHubResourceHref(value?: string | null) {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim(), "https://fluentia.invalid");
    return url.protocol === "http:" || url.protocol === "https:" ? value.trim() : null;
  } catch {
    return null;
  }
}

function getStudyHubPreviewHref(value?: string | null) {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim(), "https://fluentia.invalid");
    return ["http:", "https:", "blob:"].includes(url.protocol) ? value.trim() : null;
  } catch {
    return null;
  }
}

async function downloadStudyMaterial(title: string, href?: string | null, content?: string | null) {
  const filename = title.trim().replace(/[^a-z0-9-_]+/gi, "-").replace(/^-|-$/g, "") || "learning-material";
  const safeHref = getStudyHubResourceHref(href);
  if (safeHref) {
    try {
      const response = await fetch(safeHref);
      if (!response.ok) throw new Error(`Download request failed (${response.status})`);
      const objectUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) {
      console.error("Study material download failed; opening the original resource:", error);
      window.open(safeHref, "_blank", "noopener,noreferrer");
    }
    return;
  }
  if (!content) return;
  const plainText = /<\/?(?:p|h[1-6]|ul|ol|li|blockquote|pre|code|table|thead|tbody|tr|th|td|a|strong|em|s|span|hr|br)\b/i.test(content)
    ? new DOMParser().parseFromString(content, "text/html").body.textContent || ""
    : content;
  const objectUrl = URL.createObjectURL(new Blob([plainText], { type: "text/plain;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = `${filename}.txt`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

export function StudyHubDownloadButton({ title, href, content }: { title: string; href?: string | null; content?: string | null }) {
  const safeHref = getStudyHubResourceHref(href);
  if (!safeHref && !content) return null;
  return (
    <button type="button" onClick={() => void downloadStudyMaterial(title, safeHref, content)} className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 px-2.5 py-1.5 text-[11px] text-amber-400 transition hover:border-amber-500/40 hover:bg-amber-500/20">
      <Download className="h-3.5 w-3.5" />
      Download Material
    </button>
  );
}

function ResourceLink({ href, children, download = false }: { href: string; children: ReactNode; download?: boolean }) {
  return <a href={href} target="_blank" rel="noreferrer" download={download || undefined} className="mt-3 inline-flex rounded-md border border-amber-500/40 px-3 py-2 text-xs text-amber-400 hover:border-amber-500/40">{children}</a>;
}

export function StudyHubResourceCard({
  resource,
  downloadButton,
  onViewImage,
}: {
  resource: StudyHubResource;
  downloadButton?: ReactNode;
  onViewImage?: (resource: StudyHubResource) => void;
}) {
  const href = getStudyHubPreviewHref(resource.link_url);
  const title = resource.resource_type === "data_table" || isDataTableResourceTitle(resource.title)
    ? getDataTableResourceTitle(resource.title)
    : resource.title;

  if (resource.resource_type === "image") {
    return (
      <article className="overflow-hidden rounded-lg border border-border bg-background">
        {href
          ? <button type="button" onClick={() => onViewImage ? onViewImage(resource) : window.open(href, "_blank", "noopener,noreferrer")} aria-label={`View ${title}`} className="block w-full text-left"><img src={href} alt={title} className="aspect-[4/3] w-full object-cover" /></button>
          : <div className="aspect-[4/3] bg-surface" />}
        <div className="space-y-2 p-3">
          <h4 className="text-xs font-semibold text-stone-100">{title}</h4>
          {resource.body && <MarkdownContent value={resource.body} className="line-clamp-3 text-[11px] leading-relaxed text-stone-400" />}
          {downloadButton}
        </div>
      </article>
    );
  }

  const cardClass = resource.resource_type === "reading"
    ? "rounded-lg border border-border bg-background p-3"
    : "space-y-3 rounded-lg border border-border bg-background p-3";

  return (
    <article className={cardClass}>
      {(resource.resource_type !== "data_table" || !isDataTableResourceTitle(resource.title)) && (
        <div>
          <h4 className="text-sm font-semibold text-stone-100">{title}</h4>
          {resource.resource_type === "file" && <p className="mt-1 break-all text-[11px] text-stone-500">{resource.original_filename || "File resource"}</p>}
        </div>
      )}

      {resource.resource_type === "note" && resource.body && <StudyHubMarkdownResource title={title} value={resource.body} className="text-sm leading-relaxed text-stone-300" />}
      {resource.resource_type === "reading" && resource.body && <StudyHubMarkdownResource title={title} value={resource.body} className="mt-2 text-xs leading-relaxed text-stone-400" />}
      {resource.resource_type === "reading" && href && <ResourceLink href={href} download>Open or download</ResourceLink>}
      {resource.resource_type === "reading" && !href && resource.link_url && <p className="mt-2 break-all text-xs text-stone-500">{resource.link_url}</p>}

      {resource.resource_type === "quiz" && resource.body && <MarkdownContent value={resource.body} className="text-sm leading-relaxed text-stone-300" />}
      {resource.resource_type === "quiz" && href && <ResourceLink href={href}>Open practice</ResourceLink>}

      {resource.resource_type === "audio" && (
        <>
          {href ? <CustomAudioPlayer src={href} label={title} transcript={resource.body || undefined} /> : <p className="text-xs text-stone-500">Audio file is not available.</p>}
        </>
      )}

      {resource.resource_type === "video" && (
        <>
          {href ? <InteractiveVideoBlock videoUrl={href} title={title} /> : <p className="text-xs text-stone-500">Video is not available.</p>}
          {resource.body && <MarkdownContent value={resource.body} className="text-xs leading-relaxed text-stone-400" />}
        </>
      )}

      {resource.resource_type === "data_table" && resource.body && <DataTableResource title={title} markdown={resource.body} html={resource.bodyHtml || undefined} />}

      {resource.resource_type === "file" && (
        <>
          {href && resource.media_type?.startsWith("image/") && <button type="button" onClick={() => onViewImage ? onViewImage(resource) : window.open(href, "_blank", "noopener,noreferrer")} aria-label={`View ${title}`} className="block w-full"><img src={href} alt={resource.original_filename || title} className="max-h-[420px] w-full rounded-md border border-border object-contain" /></button>}
          {href && resource.media_type === "application/pdf" && <iframe src={href} title={`Preview of ${resource.original_filename || title}`} className="h-[480px] w-full rounded-md border border-border bg-white" />}
          {href && resource.media_type?.startsWith("text/") && <iframe src={href} title={`Preview of ${resource.original_filename || title}`} className="h-[360px] w-full rounded-md border border-border bg-white" />}
          {href && resource.media_type?.startsWith("audio/") && <CustomAudioPlayer src={href} label={title} />}
          {href && resource.media_type?.startsWith("video/") && <video src={href} controls preload="metadata" className="max-h-[480px] w-full rounded-md bg-black" aria-label={`Preview of ${resource.original_filename || title}`} />}
          {href ? <ResourceLink href={href} download={Boolean(resource.original_filename)}>Open or download</ResourceLink> : <p className="text-xs text-stone-500">This file is not available.</p>}
        </>
      )}

      {resource.resource_type === "note" && !resource.body && <p className="text-sm text-stone-500">This resource has no saved text.</p>}
      {resource.resource_type === "data_table" && !resource.body && <p className="text-sm text-stone-500">This resource has no saved text.</p>}
      {downloadButton}
    </article>
  );
}

export function StudyHubFlashcardDeck({
  cards,
  active = false,
  renderDownloadButton,
}: {
  cards: StudyHubFlashcard[];
  active?: boolean;
  renderDownloadButton?: (card: StudyHubFlashcard) => ReactNode;
}) {
  const [cardIndex, setCardIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [rightCount, setRightCount] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const currentCard = cards[cardIndex] || null;

  useEffect(() => {
    setCardIndex((index) => Math.min(index, Math.max(cards.length - 1, 0)));
    setShowAnswer(false);
  }, [cards.length]);

  useEffect(() => {
    if (!active || cards.length === 0) return;
    const handlePracticeKeys = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (event.code === "Space") {
        if (target?.closest("[role=button]") || target?.closest("button")) return;
        event.preventDefault();
        setShowAnswer((value) => !value);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        setCardIndex((index) => Math.max(0, index - 1));
        setShowAnswer(false);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setCardIndex((index) => Math.min(cards.length - 1, index + 1));
        setShowAnswer(false);
      }
    };
    window.addEventListener("keydown", handlePracticeKeys);
    return () => window.removeEventListener("keydown", handlePracticeKeys);
  }, [active, cards.length]);

  const goToCard = (index: number) => {
    setCardIndex(Math.max(0, Math.min(index, cards.length - 1)));
    setShowAnswer(false);
  };

  return (
    <section className="space-y-4" aria-label="Vocabulary and flashcards">
      <div className="flex items-center justify-between gap-3">
        <div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Vocabulary &amp; Flashcards</p><h3 className="mt-1 text-lg font-semibold text-stone-100">Study deck</h3></div>
        <span className="rounded-full border border-border bg-surface px-2 py-1 text-[10px] text-stone-300">{cards.length} cards</span>
      </div>
      {currentCard ? <>
        <div className="relative h-[340px] w-full [perspective:1600px]">
          <div
            role="button"
            tabIndex={0}
            onClick={() => setShowAnswer((value) => !value)}
            onKeyDown={(event) => {
              if (event.target !== event.currentTarget || !["Enter", " "].includes(event.key)) return;
              event.preventDefault();
              setShowAnswer((value) => !value);
            }}
            className={`relative h-full w-full cursor-pointer rounded-2xl border border-[#2b3342] bg-[#10181f] p-5 text-left shadow-[0_24px_60px_rgba(0,0,0,0.4)] transition-transform duration-700 [transform-style:preserve-3d] ${showAnswer ? "[transform:rotateY(180deg)]" : ""}`}
          >
            <div className="absolute inset-0 flex flex-col justify-between rounded-2xl p-5 [backface-visibility:hidden]">
              <div className="flex items-center justify-between gap-2"><span className="text-[10px] uppercase tracking-[0.16em] text-amber-400">{cardIndex + 1} / {cards.length}</span><span className="rounded-full border border-amber-500/40 bg-amber-500/20 px-2 py-1 text-[10px] uppercase text-amber-400">Question</span></div>
              <div className="max-h-[190px] overflow-y-auto break-words text-xl leading-snug text-stone-100"><MarkdownContent value={currentCard.question} /></div>
              <div className="flex justify-center"><span className="rounded-full border border-border bg-surface px-4 py-2 text-[11px] text-stone-300">See answer</span></div>
            </div>
            <div className="absolute inset-0 flex flex-col justify-between rounded-2xl p-5 [backface-visibility:hidden] [transform:rotateY(180deg)]">
              <div className="flex items-center justify-between gap-2"><span className="text-[10px] uppercase tracking-[0.16em] text-emerald-300">Answer</span><span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] uppercase text-emerald-200">Key idea</span></div>
              <div className="max-h-[190px] overflow-y-auto break-words text-lg leading-relaxed text-stone-100"><MarkdownContent value={currentCard.answer} /></div>
              {currentCard.explanation && <div className="max-h-16 overflow-y-auto border-t border-border pt-2 text-xs leading-relaxed text-stone-300"><MarkdownContent value={currentCard.explanation} /></div>}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-background p-2">
          <button type="button" onClick={() => goToCard(cardIndex - 1)} disabled={cardIndex === 0} aria-label="Previous flashcard" className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-stone-200 hover:border-amber-500/40 disabled:cursor-not-allowed disabled:opacity-40"><ArrowLeft className="h-4 w-4" /></button>
          <button type="button" onClick={() => { setWrongCount((count) => count + 1); goToCard(cardIndex + 1); }} aria-label={`Mark incorrect, ${wrongCount} incorrect`} className="flex h-9 min-w-14 items-center justify-center gap-1.5 rounded-md border border-red-500/40 bg-red-500/10 px-2 text-xs text-red-200"><X className="h-4 w-4" /><span>{wrongCount}</span></button>
          <button type="button" onClick={() => { setRightCount((count) => count + 1); goToCard(cardIndex + 1); }} aria-label={`Mark correct, ${rightCount} correct`} className="flex h-9 min-w-14 items-center justify-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 text-xs text-emerald-200"><Check className="h-4 w-4" /><span>{rightCount}</span></button>
          <button type="button" onClick={() => goToCard(cardIndex + 1)} disabled={cardIndex >= cards.length - 1} aria-label="Next flashcard" className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-stone-200 hover:border-amber-500/40 disabled:cursor-not-allowed disabled:opacity-40"><ArrowRight className="h-4 w-4" /></button>
        </div>
        {renderDownloadButton?.(currentCard)}
        <p className="text-center text-[10px] text-stone-600">Space to flip · Arrow keys to navigate</p>
      </> : <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-stone-500">Your instructor’s flashcards and saved vocabulary will appear here.</p>}
    </section>
  );
}
