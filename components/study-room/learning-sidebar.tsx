"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, BookMarked, Check, Copy, ExternalLink, FileDown, FileText, Headphones, Image as ImageIcon, Layers3, Library, Table, Trash2, Video, X } from "lucide-react";
import { MarkdownContent } from "@/components/study-room/markdown-content";
import { isDataTableResourceTitle } from "@/components/shared/data-table-resource";
import { getStudyHubResourceHref, StudyHubDownloadButton, StudyHubFlashcardDeck, StudyHubResourceCard, type StudyHubResource } from "@/components/shared/study-hub-resource-card";
import { Tooltip } from "@/components/shared/tooltip";
import { supabase } from "@/lib/supabaseClient";
import { SavedVocabularyWord, StudentNote } from "@/types/lesson";

export type LearningTab = "vocab" | "notes" | "reading" | "flashcards" | "quizzes" | "audio" | "video" | "image" | "data_table" | "files";
type StudentResource = StudyHubResource & { lesson_id: string | null };

interface LearningSidebarProps {
  open: boolean;
  words: SavedVocabularyWord[];
  notes: StudentNote[];
  studentId?: string;
  studentToken?: string;
  activeLessonId?: string;
  standalone?: boolean;
  previewResources?: StudyHubResource[];
  initialTab?: LearningTab;
  resource?: string;
  resources?: { id: string; title: string; url: string; type: string }[];
  onClose: () => void;
  onSaveNote: (note: StudentNote) => void;
  onRemoveWord: (word: string) => void;
}

function getSafeResourceHref(value?: string | null) {
  return getStudyHubResourceHref(value);
}

type MarkdownTable = { headers: string[]; rows: string[][] };

function isRichTextHtml(value: string) {
  return /<\/?(?:p|h[1-6]|ul|ol|li|blockquote|pre|code|table|thead|tbody|tr|th|td|a|strong|em|s|span|hr|br)\b/i.test(value);
}

function splitMarkdownTableRow(line: string) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim().replace(/\\\|/g, "|"));
}

function extractMarkdownTables(content: string): MarkdownTable[] {
  if (isRichTextHtml(content)) {
    const parsed = new DOMParser().parseFromString(content, "text/html");
    return Array.from(parsed.querySelectorAll("table")).map((table) => {
      const rows = Array.from(table.rows);
      const headerRow = rows.find((row) => row.querySelector("th"));
      const headers = Array.from(headerRow?.cells || []).map((cell) => cell.textContent?.trim() || "");
      return {
        headers,
        rows: rows.filter((row) => row !== headerRow).map((row) => Array.from(row.cells).map((cell) => cell.textContent?.trim() || "")),
      };
    }).filter((table) => table.headers.length > 0);
  }

  const lines = content.split(/\r?\n/);
  const tables: MarkdownTable[] = [];
  for (let index = 0; index < lines.length - 1; index += 1) {
    const headerLine = lines[index].trim();
    const separatorLine = lines[index + 1].trim();
    if (!headerLine.includes("|") || !/^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?$/.test(separatorLine)) continue;
    const headers = splitMarkdownTableRow(headerLine);
    const rows: string[][] = [];
    index += 2;
    while (index < lines.length && lines[index].includes("|")) {
      const row = splitMarkdownTableRow(lines[index]);
      if (row.some(Boolean)) rows.push(row);
      index += 1;
    }
    tables.push({ headers, rows });
    index -= 1;
  }
  return tables;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] || character);
}

function printMarkdownTables(title: string, tables: MarkdownTable[]) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return false;
  const tableMarkup = tables.map(({ headers, rows }) => `
    <table>
      <thead><tr>${headers.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("")}</tr></thead>
      <tbody>${rows.map((row) => `<tr>${headers.map((_, cellIndex) => `<td>${escapeHtml(row[cellIndex] || "")}</td>`).join("")}</tr>`).join("")}</tbody>
    </table>`).join("");
  printWindow.document.write(`<!doctype html><html><head><title>${escapeHtml(title)}</title><meta charset="utf-8"><style>
    @page { size: A4; margin: 18mm; }
    body { color: #1f2937; font: 11pt/1.45 Arial, sans-serif; }
    h1 { font-size: 18pt; margin: 0 0 18pt; }
    table { border-collapse: collapse; margin: 0 0 18pt; width: 100%; break-inside: avoid; }
    th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
    th { background: #fef3c7; color: #b45309; font-weight: 700; }
    tbody tr:nth-child(even) { background: #f8fafc; }
  </style></head><body><h1>${escapeHtml(title)}</h1>${tableMarkup}</body></html>`);
  printWindow.document.close();
  printWindow.addEventListener("load", () => {
    printWindow.focus();
    printWindow.print();
  }, { once: true });
  return true;
}

function MarkdownResourceContent({ title, value, className = "" }: { title: string; value: string; className?: string }) {
  const [exportStatus, setExportStatus] = useState("");
  const [tables, setTables] = useState<MarkdownTable[]>([]);

  useEffect(() => {
    setTables(extractMarkdownTables(value));
  }, [value]);

  const copyOrDownloadText = async () => {
    const plainText = isRichTextHtml(value)
      ? new DOMParser().parseFromString(value, "text/html").body.textContent || ""
      : value;
    try {
      await navigator.clipboard.writeText(plainText);
      setExportStatus("Table text copied.");
    } catch {
      const url = URL.createObjectURL(new Blob([plainText], { type: "text/plain;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${title.replace(/[^a-z0-9-_]+/gi, "-") || "resource"}.txt`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportStatus("Text file downloaded.");
    }
  };

  return (
    <div className="min-w-0">
      {tables.length > 0 && <div className="mb-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => { if (!printMarkdownTables(title, tables)) setExportStatus("Allow pop-ups to print this table as PDF."); }} className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 px-2.5 py-1.5 text-[11px]  text-amber-400 transition hover:bg-amber-500/20">
          <FileDown className="h-3.5 w-3.5" /> Download PDF
        </button>
        <button type="button" onClick={() => void copyOrDownloadText()} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[11px]  text-stone-300 transition hover:border-amber-500/40 hover:text-amber-400">
          <Copy className="h-3.5 w-3.5" /> Copy / Export Text
        </button>
        {exportStatus && <span className="text-[10px] text-stone-500" role="status">{exportStatus}</span>}
      </div>}
      <MarkdownContent value={value} className={className} dataTables />
    </div>
  );
}

function DownloadMaterialButton({ title, href, content }: { title: string; href?: string | null; content?: string | null }) {
  return <StudyHubDownloadButton title={title} href={href} content={content} />;
}

export function LearningSidebar({
  open,
  words,
  notes,
  studentId,
  studentToken,
  activeLessonId,
  standalone = false,
  previewResources,
  initialTab,
  resource,
  resources = [],
  onClose,
  onSaveNote,
  onRemoveWord,
}: LearningSidebarProps) {
  const [tab, setTab] = useState<LearningTab>("vocab");
  const [resourcesReady, setResourcesReady] = useState(false);
  const [assignedResources, setAssignedResources] = useState<StudentResource[]>([]);
  const [resourcesLoading, setResourcesLoading] = useState(false);
  const [resourcesError, setResourcesError] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<StudentResource | null>(null);
  const tabSelectionMade = useRef(false);

  const openInNewTab = () => {
    const currentLessonPath = window.location.pathname.match(/^\/lessons\/[^/]+/)?.[0];
    const lessonPath = currentLessonPath || (activeLessonId ? `/lessons/${encodeURIComponent(activeLessonId)}` : null);
    if (!lessonPath) return;

    window.open(`${lessonPath}/study-hub`, "_blank", "noopener,noreferrer");
  };

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (lightboxImage) setLightboxImage(null);
        else onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose, lightboxImage]);

  useEffect(() => {
    let cancelled = false;
    if (previewResources) {
      setAssignedResources(previewResources.map((item) => ({ ...item, lesson_id: item.lesson_id || null })));
      setResourcesLoading(false);
      setResourcesError(null);
      setResourcesReady(true);
      return;
    }
    if (!open || (!studentId && !studentToken) || !activeLessonId) {
      setAssignedResources([]);
      setResourcesLoading(false);
      setResourcesError(null);
      setResourcesReady(true);
      return;
    }

    setResourcesReady(false);
    setResourcesLoading(true);
    setResourcesError(null);
    const loadResources = async () => {
      const query = supabase.from("student_resources").select("*");
      const result = studentId
        ? await query.eq("student_id", studentId).eq("lesson_id", activeLessonId).order("created_at", { ascending: false })
        : await query.eq("student_token", studentToken!).eq("lesson_id", activeLessonId).order("created_at", { ascending: false });
      if (cancelled) return;
      if (result.error) {
        setResourcesError("Your assigned materials could not be loaded.");
        setAssignedResources([]);
        console.error("Unable to load assigned student resources:", result.error.message);
      } else {
        setAssignedResources((result.data || []) as StudentResource[]);
      }
      setResourcesLoading(false);
      setResourcesReady(true);
    };

    void loadResources().catch((error) => {
      if (cancelled) return;
      setResourcesError("Your assigned materials could not be loaded.");
      setAssignedResources([]);
      setResourcesLoading(false);
      setResourcesReady(true);
      console.error("Unable to load assigned student resources:", error);
    });

    return () => {
      cancelled = true;
    };
  }, [open, studentId, studentToken, activeLessonId, previewResources]);

  const flashcardResources = assignedResources
    .filter((item) => item.resource_type === "flashcard" || item.resource_type === "flashcards")
    .slice()
    .sort((left, right) => {
      const leftTime = left.created_at ? new Date(left.created_at).getTime() : 0;
      const rightTime = right.created_at ? new Date(right.created_at).getTime() : 0;
      return leftTime - rightTime || left.id.localeCompare(right.id);
    });
  const flashcards = flashcardResources.flatMap((item) => {
    const cards = item.cards?.filter((card) => (
      card && typeof card.front === "string" && typeof card.back === "string"
    ));
    if (cards?.length) {
      return cards.map((card, index) => ({
        id: card.id || `${item.id}-${index}`,
        question: card.front,
        answer: card.back,
        explanation: card.explanation || "",
      }));
    }
    if (item.resource_type === "flashcard" && item.question) {
      return [{
        id: item.id,
        question: item.question,
        answer: item.answer || "No answer provided.",
        explanation: item.explanation || item.subtitle || item.sub_title || item.example || "",
      }];
    }
    return [];
  });
  const studyCards = flashcards.length > 0
    ? flashcards
    : words.map((word) => ({
      id: word.word,
      question: word.word,
      answer: word.definition,
      explanation: word.example || "",
    }));
  const tabs = [
    ["vocab", "Vocab", BookMarked],
    ["notes", "Notes", FileText],
    ["reading", "Reading", Library],
    ["flashcards", "Cards", Layers3],
    ["quizzes", "Quizzes", Check],
    ["audio", "Audio", Headphones],
    ["video", "Video", Video],
    ["image", "Images", ImageIcon],
    ["data_table", "Data Table", Table],
    ["files", "Files", FileText],
  ] as const;

  const noteResources = assignedResources.filter((item) => item.resource_type === "note" && !isDataTableResourceTitle(item.title));
  const readingResources = assignedResources.filter((item) => item.resource_type === "reading");
  const quizResources = assignedResources.filter((item) => item.resource_type === "quiz");
  const audioResources = assignedResources.filter((item) => item.resource_type === "audio");
  const videoResources = assignedResources.filter((item) => item.resource_type === "video");
  const imageResources = assignedResources.filter((item) => item.resource_type === "image");
  const dataTableResources = assignedResources.filter((item) => item.resource_type === "data_table" || isDataTableResourceTitle(item.title));
  const fileResources = assignedResources.filter((item) => item.resource_type === "file");
  const tabItemCounts: Record<LearningTab, number> = {
    vocab: words.length,
    notes: noteResources.length + (resource?.trim() ? 1 : 0) + notes.filter((note) => note.text.trim()).length,
    reading: readingResources.length + resources.filter((item) => getSafeResourceHref(item.url)).length,
    flashcards: flashcards.length || words.length,
    quizzes: quizResources.length,
    audio: audioResources.length,
    video: videoResources.length,
    image: imageResources.length,
    data_table: dataTableResources.length,
    files: fileResources.length,
  };
  const firstPopulatedTab = (Object.keys(tabItemCounts) as LearningTab[])
    .find((candidate) => tabItemCounts[candidate] > 0) || "vocab";

  useEffect(() => {
    if (!open) {
      tabSelectionMade.current = false;
      return;
    }
    if (!resourcesReady) return;
    if (initialTab) {
      setTab(initialTab);
      tabSelectionMade.current = true;
      return;
    }
    if (tabSelectionMade.current) return;
    setTab(firstPopulatedTab);
  }, [open, resourcesReady, firstPopulatedTab, initialTab]);

  return (
    <>
      {!standalone && (
        <button
          type="button"
          aria-label="Close Learning Hub"
          aria-hidden={!open}
          tabIndex={open ? 0 : -1}
          onClick={onClose}
          className={`fixed inset-0 z-[1090] bg-black/55 transition-opacity duration-200 ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
        />
      )}
      <aside
        className={standalone
          ? "flex min-h-0 h-dvh w-full flex-col bg-surface text-stone-200"
          : `fixed bottom-0 right-0 top-0 z-[1100] flex w-full max-w-xl flex-col border-l border-border bg-surface shadow-2xl transition-transform duration-200 ${open ? "translate-x-0" : "translate-x-full"}`}
        id={standalone ? undefined : "learning-sidebar"}
        aria-hidden={standalone ? undefined : !open}
      >
        <div className="flex items-start justify-between border-b border-border p-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-400">Learning Hub</p>
            <h2 className="mt-1 font-sans text-2xl text-stone-100">Your study tools</h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {!standalone && activeLessonId && (
              <Tooltip content="Open Learning Hub in a New Tab">
              <button
                type="button"
                onClick={openInNewTab}
                aria-label="Open Learning Hub in a New Tab"
                tabIndex={open ? 0 : -1}
                className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-stone-400 transition hover:border-amber-500/40 hover:text-amber-400"
              >
                <ExternalLink className="h-4 w-4" />
              </button>
              </Tooltip>
            )}
            <button type="button" onClick={onClose} aria-label={standalone ? "Return to lesson" : "Close Learning Hub"} tabIndex={open ? 0 : -1} className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-stone-400 transition hover:border-amber-500/40 hover:text-amber-400">
              {standalone ? <ArrowLeft className="h-5 w-5" /> : <X className="h-5 w-5" />}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 border-b border-border p-3 min-[380px]:grid-cols-3 sm:grid-cols-5">
          {tabs.map(([id, label, Icon]) => {
            const itemCount = tabItemCounts[id];
            const hasContent = itemCount > 0;
            return (
              <Tooltip key={id} content={hasContent ? `${itemCount} ${itemCount === 1 ? "item" : "items"}` : "No materials assigned for this lesson"}>
              <button
                type="button"
                onClick={() => {
                  tabSelectionMade.current = true;
                  setTab(id);
                }}
                aria-pressed={tab === id}
                aria-label={`${label}${hasContent ? `, ${itemCount} items` : ", no materials assigned for this lesson"}`}
                className={`flex min-h-16 min-w-0 w-full flex-col items-center justify-center gap-1 rounded-md border px-1.5 py-2 text-[10px] transition-all ${tab === id ? "border-amber-500/40 bg-amber-500/20 text-amber-400" : "border-transparent text-stone-500 hover:border-border hover:bg-surface hover:text-stone-300"} ${hasContent ? "" : "opacity-40 hover:opacity-70"}`}
              >
                <span className="relative inline-flex">
                  <Icon className="h-4 w-4" />
                  {hasContent && <span aria-hidden="true" className="absolute -right-2 -top-1 min-w-3 rounded-full bg-amber-400 px-1 text-center text-[8px] font-bold leading-3 text-background">{itemCount > 99 ? "99+" : itemCount}</span>}
                </span>
                <span className="w-full truncate text-center">{label}</span>
              </button>
              </Tooltip>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {resourcesLoading && <p className="mb-4 text-xs text-stone-500" role="status">Loading instructor materials...</p>}
          {resourcesError && <p className="mb-4 text-xs text-red-300" role="alert">{resourcesError}</p>}

          {tab === "vocab" && (
            <section aria-label="Saved vocabulary" className="space-y-3">
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Vocabulary</h3>
              {words.length === 0 ? <p className="text-sm text-stone-500">Double-click any lesson word to save it here.</p> : words.map((word) => (
                <article key={word.word} className="rounded-lg border border-border bg-background p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div><p className="font-semibold text-stone-100">{word.word}</p><p className="mt-1 text-xs text-amber-400">{word.partOfSpeech}</p></div>
                    <button type="button" onClick={() => onRemoveWord(word.word)} aria-label={`Remove ${word.word}`} className="text-stone-600 hover:text-red-300"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-stone-400">{word.definition}</p>
                  {word.example && <p className="mt-2 text-xs italic text-stone-500">{word.example}</p>}
                  <div className="mt-3"><DownloadMaterialButton title={word.word} content={`${word.word}\n${word.partOfSpeech}\n${word.definition}${word.example ? `\n${word.example}` : ""}`} /></div>
                </article>
              ))}
            </section>
          )}

          {tab === "notes" && (
            <section className="space-y-5" aria-label="Instructor and personal notes">
              <div className="space-y-3">
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Instructor Notes</h3>
                {resource && <div className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/20 p-3"><MarkdownResourceContent title="Instructor Notes" value={resource} className="text-sm leading-relaxed text-stone-300" /><DownloadMaterialButton title="Instructor Notes" content={resource} /></div>}
                {noteResources.length === 0 && !resource ? <p className="text-sm text-stone-500">Your instructor has not added notes yet.</p> : noteResources.map((item) => (
                  <StudyHubResourceCard key={item.id} resource={item} downloadButton={<div className="mt-3"><DownloadMaterialButton title={item.title} href={getSafeResourceHref(item.link_url)} content={item.body} /></div>} />
                ))}
              </div>
              <div className="space-y-2 border-t border-border pt-4">
                <div className="flex items-center justify-between gap-3"><h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">My Notes</h3><DownloadMaterialButton title="My Notes" content={notes[0]?.text} /></div>
                <textarea value={notes[0]?.text || ""} onChange={(event) => onSaveNote({ id: notes[0]?.id || "personal", text: event.target.value, updatedAt: new Date().toISOString() })} placeholder="Your personal notes auto-save as you type..." rows={8} className="w-full resize-y rounded-lg border border-border bg-background p-3 text-sm leading-relaxed text-stone-200 outline-none focus:border-amber-500/40" />
                <p className="text-[10px] text-stone-600">Auto-saved locally for this student.</p>
              </div>
            </section>
          )}

          {tab === "reading" && (
            <section className="space-y-3" aria-label="Reading materials">
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Reading Materials</h3>
              {readingResources.length === 0 && resources.length === 0 && <p className="text-sm text-stone-500">Your instructor has not prescribed reading materials yet.</p>}
              {readingResources.map((item) => {
                const href = getSafeResourceHref(item.link_url);
                return <StudyHubResourceCard key={item.id} resource={item} downloadButton={<div className="mt-3"><DownloadMaterialButton title={item.title} href={href} content={item.body} /></div>} />;
              })}
              {resources.map((item) => {
                const href = getSafeResourceHref(item.url);
                if (!href) return null;
                return <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2.5 text-xs text-stone-300">
                  <a href={href} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-medium hover:text-amber-400">{item.title || item.url}</a>
                  <span className="shrink-0 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-amber-400">{item.type}</span>
                  <DownloadMaterialButton title={item.title || item.type} href={href} />
                </div>;
              })}
            </section>
          )}

          {tab === "data_table" && (
            <section className="space-y-3" aria-label="Data table resources">
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Data Tables</h3>
              {dataTableResources.length === 0 ? <p className="text-sm text-stone-500">Your instructor has not assigned a Data Table yet.</p> : dataTableResources.map((item) => <StudyHubResourceCard key={item.id} resource={item} />)}
            </section>
          )}

          {tab === "flashcards" && (
            <StudyHubFlashcardDeck
              active={open && tab === "flashcards"}
              cards={studyCards}
              renderDownloadButton={(card) => <DownloadMaterialButton title={card.question} content={`${card.question}\n\n${card.answer}${card.explanation ? `\n\n${card.explanation}` : ""}`} />}
            />
          )}

          {tab === "quizzes" && (
            <section className="space-y-3" aria-label="Practice quizzes">
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Practice Quizzes</h3>
              {quizResources.length === 0 ? <p className="text-sm text-stone-500">Your instructor has not assigned a practice quiz yet.</p> : quizResources.map((item) => (
                <StudyHubResourceCard key={item.id} resource={item} downloadButton={<div className="mt-3"><DownloadMaterialButton title={item.title} href={getSafeResourceHref(item.link_url)} content={item.body} /></div>} />
              ))}
            </section>
          )}

          {tab === "audio" && (
            <section className="space-y-3" aria-label="Audio materials">
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Audio Materials</h3>
              {audioResources.length === 0 ? <p className="text-sm text-stone-500">Your instructor has not assigned audio materials yet.</p> : audioResources.map((item) => {
                const audioHref = getSafeResourceHref(item.link_url);
                return <StudyHubResourceCard key={item.id} resource={item} downloadButton={<div className="mt-3"><DownloadMaterialButton title={item.title} href={audioHref} content={item.body} /></div>} />;
              })}
            </section>
          )}

          {tab === "video" && (
            <section className="space-y-3" aria-label="Video resources">
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Video Resources</h3>
              {videoResources.length === 0 ? <p className="text-sm text-stone-500">Your instructor has not added videos yet.</p> : videoResources.map((item) => {
                const videoHref = getSafeResourceHref(item.link_url);
                return <StudyHubResourceCard key={item.id} resource={item} downloadButton={<div className="mt-3"><DownloadMaterialButton title={item.title} href={videoHref} content={item.body} /></div>} />;
              })}
            </section>
          )}

          {tab === "image" && (
            <section className="space-y-3" aria-label="Image resources">
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Image Resources</h3>
              {imageResources.length === 0 ? <p className="text-sm text-stone-500">Your instructor has not added images yet.</p> : <div className="grid grid-cols-2 gap-3">{imageResources.map((item) => {
                return <StudyHubResourceCard key={item.id} resource={item} onViewImage={() => setLightboxImage(item)} downloadButton={<div className="mt-3"><DownloadMaterialButton title={item.title} href={getSafeResourceHref(item.link_url)} /></div>} />;
              })}</div>}
            </section>
          )}

          {tab === "files" && (
            <section className="space-y-3" aria-label="File resources">
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Shared Files</h3>
              {fileResources.length === 0 ? <p className="text-sm text-stone-500">Your instructor has not shared any files yet.</p> : fileResources.map((item) => {
                return <StudyHubResourceCard key={item.id} resource={item} onViewImage={() => setLightboxImage(item)} />;
              })}
            </section>
          )}
        </div>
      </aside>
      {open && lightboxImage && getSafeResourceHref(lightboxImage.link_url) && (
        <div role="dialog" aria-modal="true" aria-label={`Image preview: ${lightboxImage.title}`} onClick={(event) => { if (event.target === event.currentTarget) setLightboxImage(null); }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 sm:p-8">
          <button type="button" onClick={() => setLightboxImage(null)} aria-label="Close image preview" className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-md border border-white/20 bg-black/50 text-white hover:bg-black/80"><X className="h-5 w-5" /></button>
          <img src={getSafeResourceHref(lightboxImage.link_url) ?? undefined} alt={lightboxImage.title} className="max-h-full max-w-full object-contain" />
        </div>
      )}
    </>
  );
}
