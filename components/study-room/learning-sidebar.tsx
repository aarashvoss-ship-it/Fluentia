"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, BookMarked, Check, Copy, Download, FileDown, FileText, Headphones, Image as ImageIcon, Layers3, Library, Table, Trash2, Video, X } from "lucide-react";
import { MarkdownContent } from "@/components/study-room/markdown-content";
import { DataTableResource, getDataTableResourceTitle, isDataTableResourceTitle } from "@/components/shared/data-table-resource";
import { CustomAudioPlayer } from "@/components/study-room/custom-audio-player";
import { InteractiveVideoBlock } from "@/components/shared/interactive-video-block";
import { supabase } from "@/lib/supabaseClient";
import { SavedVocabularyWord, StudentNote } from "@/types/lesson";

type LearningTab = "vocab" | "notes" | "reading" | "flashcards" | "quizzes" | "audio" | "video" | "image" | "data_table" | "files";
type StudentResource = {
  id: string;
  lesson_id: string | null;
  resource_type: "note" | "reading" | "flashcard" | "flashcards" | "quiz" | "audio" | "data_table" | "file" | "image" | "video";
  title: string;
  body?: string | null;
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
};

interface LearningSidebarProps {
  open: boolean;
  words: SavedVocabularyWord[];
  notes: StudentNote[];
  studentId?: string;
  studentToken?: string;
  activeLessonId?: string;
  resource?: string;
  resources?: { id: string; title: string; url: string; type: string }[];
  onClose: () => void;
  onSaveNote: (note: StudentNote) => void;
  onRemoveWord: (word: string) => void;
}

function getSafeResourceHref(value?: string | null) {
  if (!value?.trim()) return null;
  const rawUrl = value.trim();
  try {
    const url = new URL(rawUrl, "https://fluentia.invalid");
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return rawUrl;
  } catch {
    return null;
  }
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
        <button type="button" onClick={() => void copyOrDownloadText()} className="inline-flex items-center gap-1.5 rounded-md border border-[#394252] px-2.5 py-1.5 text-[11px]  text-stone-300 transition hover:border-amber-500/40 hover:text-amber-400">
          <Copy className="h-3.5 w-3.5" /> Copy / Export Text
        </button>
        {exportStatus && <span className="text-[10px] text-stone-500" role="status">{exportStatus}</span>}
      </div>}
      <MarkdownContent value={value} className={className} dataTables />
    </div>
  );
}

async function handleDownload(fileUrl: string, fileName: string) {
  try {
    const response = await fetch(fileUrl);
    if (!response.ok) throw new Error(`Download request failed (${response.status})`);
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName || "download";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
  } catch (error) {
    console.error("Download failed, opening fallback link:", error);
    window.open(fileUrl, "_blank", "noopener,noreferrer");
  }
}

async function downloadMaterial(title: string, href?: string | null, content?: string | null) {
  const filename = `${title.trim().replace(/[^a-z0-9-_]+/gi, "-").replace(/^-|-$/g, "") || "learning-material"}`;
  if (href) {
    await handleDownload(href, filename);
    return;
  }
  if (content) {
    const plainText = isRichTextHtml(content)
      ? new DOMParser().parseFromString(content, "text/html").body.textContent || ""
      : content;
    const objectUrl = URL.createObjectURL(new Blob([plainText], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `${filename}.txt`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
}

function DownloadMaterialButton({ title, href, content }: { title: string; href?: string | null; content?: string | null }) {
  if (!href && !content) return null;
  return (
    <button type="button" onClick={() => void downloadMaterial(title, href, content)} className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 px-2.5 py-1.5 text-[11px]  text-amber-400 transition hover:border-amber-500/40 hover:bg-amber-500/20">
      <Download className="h-3.5 w-3.5" />
      Download Material
    </button>
  );
}

export function LearningSidebar({
  open,
  words,
  notes,
  studentId,
  studentToken,
  activeLessonId,
  resource,
  resources = [],
  onClose,
  onSaveNote,
  onRemoveWord,
}: LearningSidebarProps) {
  const [tab, setTab] = useState<LearningTab>("vocab");
  const [assignedResources, setAssignedResources] = useState<StudentResource[]>([]);
  const [resourcesLoading, setResourcesLoading] = useState(false);
  const [resourcesError, setResourcesError] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<StudentResource | null>(null);
  const [cardIndex, setCardIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [rightCount, setRightCount] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);

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
    if (!open || (!studentId && !studentToken) || !activeLessonId) {
      setAssignedResources([]);
      setResourcesLoading(false);
      setResourcesError(null);
      return;
    }

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
    };

    void loadResources().catch((error) => {
      if (cancelled) return;
      setResourcesError("Your assigned materials could not be loaded.");
      setAssignedResources([]);
      setResourcesLoading(false);
      console.error("Unable to load assigned student resources:", error);
    });

    return () => {
      cancelled = true;
    };
  }, [open, studentId, studentToken, activeLessonId]);

  const flashcards = assignedResources.flatMap((item) => {
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
  const currentCard = studyCards[cardIndex] || null;

  useEffect(() => {
    setCardIndex((index) => Math.min(index, Math.max(studyCards.length - 1, 0)));
    setShowAnswer(false);
  }, [studyCards.length]);

  useEffect(() => {
    if (!open || tab !== "flashcards" || studyCards.length === 0) return;
    function handlePracticeKeys(event: KeyboardEvent) {
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
        setCardIndex((index) => Math.min(studyCards.length - 1, index + 1));
        setShowAnswer(false);
      }
    }
    window.addEventListener("keydown", handlePracticeKeys);
    return () => window.removeEventListener("keydown", handlePracticeKeys);
  }, [open, tab, studyCards.length]);

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

  const goToCard = (index: number) => {
    setCardIndex(Math.max(0, Math.min(index, studyCards.length - 1)));
    setShowAnswer(false);
  };

  const rateCard = (correct: boolean) => {
    if (correct) setRightCount((count) => count + 1);
    else setWrongCount((count) => count + 1);
    goToCard(cardIndex + 1);
  };

  const noteResources = assignedResources.filter((item) => item.resource_type === "note" && !isDataTableResourceTitle(item.title));
  const readingResources = assignedResources.filter((item) => item.resource_type === "reading");
  const quizResources = assignedResources.filter((item) => item.resource_type === "quiz");
  const audioResources = assignedResources.filter((item) => item.resource_type === "audio");
  const videoResources = assignedResources.filter((item) => item.resource_type === "video");
  const imageResources = assignedResources.filter((item) => item.resource_type === "image");
  const dataTableResources = assignedResources.filter((item) => item.resource_type === "data_table" || isDataTableResourceTitle(item.title));
  const fileResources = assignedResources.filter((item) => item.resource_type === "file");

  return (
    <>
      <button
        type="button"
        aria-label="Close Learning Hub"
        aria-hidden={!open}
        tabIndex={open ? 0 : -1}
        onClick={onClose}
        className={`fixed inset-0 z-[1090] bg-black/55 transition-opacity duration-200 ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />
      <aside
        className={`fixed bottom-0 right-0 top-0 z-[1100] flex w-full max-w-xl flex-col border-l border-[#29303c] bg-[#121721] shadow-2xl transition-transform duration-200 ${open ? "translate-x-0" : "translate-x-full"}`}
        id="learning-sidebar"
        aria-hidden={!open}
      >
        <div className="flex items-start justify-between border-b border-[#29303c] p-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-400">Learning Hub</p>
            <h2 className="mt-1 font-sans text-2xl text-stone-100">Your study tools</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close Learning Hub" tabIndex={open ? 0 : -1} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#394252] text-stone-400 transition hover:border-amber-500/40 hover:text-amber-400">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 border-b border-[#29303c] p-3 min-[380px]:grid-cols-3 sm:grid-cols-5">
          {tabs.map(([id, label, Icon]) => (
            <button key={id} type="button" onClick={() => setTab(id)} aria-pressed={tab === id} className={`flex min-h-16 min-w-0 w-full flex-col items-center justify-center gap-1 rounded-md border px-1.5 py-2 text-[10px] transition-colors ${tab === id ? "border-amber-500/40 bg-amber-500/20 text-amber-400" : "border-transparent text-stone-500 hover:border-[#394252] hover:bg-[#171d28] hover:text-stone-300"}`}>
              <Icon className="h-4 w-4" />
              <span className="w-full truncate text-center">{label}</span>
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {resourcesLoading && <p className="mb-4 text-xs text-stone-500" role="status">Loading instructor materials...</p>}
          {resourcesError && <p className="mb-4 text-xs text-red-300" role="alert">{resourcesError}</p>}

          {tab === "vocab" && (
            <section aria-label="Saved vocabulary" className="space-y-3">
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Vocabulary</h3>
              {words.length === 0 ? <p className="text-sm text-stone-500">Double-click any lesson word to save it here.</p> : words.map((word) => (
                <article key={word.word} className="rounded-lg border border-[#29303c] bg-[#0c1017] p-3">
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
                  <article key={item.id} className="rounded-lg border border-[#29303c] bg-[#0c1017] p-3">
                    <h4 className="mb-2 text-sm font-semibold text-stone-100">{item.title}</h4>
                    {item.body && <MarkdownResourceContent title={item.title} value={item.body} className="text-sm leading-relaxed text-stone-300" />}
                    <div className="mt-3"><DownloadMaterialButton title={item.title} href={getSafeResourceHref(item.link_url)} content={item.body} /></div>
                  </article>
                ))}
              </div>
              <div className="space-y-2 border-t border-[#29303c] pt-4">
                <div className="flex items-center justify-between gap-3"><h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">My Notes</h3><DownloadMaterialButton title="My Notes" content={notes[0]?.text} /></div>
                <textarea value={notes[0]?.text || ""} onChange={(event) => onSaveNote({ id: notes[0]?.id || "personal", text: event.target.value, updatedAt: new Date().toISOString() })} placeholder="Your personal notes auto-save as you type..." rows={8} className="w-full resize-y rounded-lg border border-[#29303c] bg-[#0c1017] p-3 text-sm leading-relaxed text-stone-200 outline-none focus:border-amber-500/40" />
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
                return <article key={item.id} className="rounded-lg border border-[#29303c] bg-[#0c1017] p-3">
                  <h4 className="text-sm font-semibold text-stone-100">{item.title}</h4>
                  {item.body && <MarkdownResourceContent title={item.title} value={item.body} className="mt-2 text-xs leading-relaxed text-stone-400" />}
                  {href ? <a href={href} target="_blank" rel="noreferrer" download className="mt-3 inline-flex items-center rounded-md border border-amber-500/40 px-3 py-2 text-xs  text-amber-400 hover:border-amber-500/40">Open or download</a> : item.link_url && <p className="mt-2 break-all text-xs text-stone-500">{item.link_url}</p>}
                  <div className="mt-3"><DownloadMaterialButton title={item.title} href={href} content={item.body} /></div>
                </article>;
              })}
              {resources.map((item) => {
                const href = getSafeResourceHref(item.url);
                if (!href) return null;
                return <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#202631] bg-[#0c1017] px-3 py-2.5 text-xs text-stone-300">
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
              {dataTableResources.length === 0 ? <p className="text-sm text-stone-500">Your instructor has not assigned a Data Table yet.</p> : dataTableResources.map((item) => (
                <article key={item.id} className="space-y-3 rounded-lg border border-[#29303c] bg-[#0c1017] p-3">
                  {!isDataTableResourceTitle(item.title) && <h4 className="text-sm font-semibold text-stone-100">{getDataTableResourceTitle(item.title)}</h4>}
                  {item.body && <DataTableResource title={getDataTableResourceTitle(item.title)} markdown={item.body} />}
                </article>
              ))}
            </section>
          )}

          {tab === "flashcards" && (
            <section className="space-y-4" aria-label="Vocabulary and flashcards">
              <div className="flex items-center justify-between gap-3">
                <div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Vocabulary &amp; Flashcards</p><h3 className="mt-1 text-lg font-semibold text-stone-100">Study deck</h3></div>
                <span className="rounded-full border border-[#394252] bg-[#171d28] px-2 py-1 text-[10px] text-stone-300">{studyCards.length} cards</span>
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
                      <div className="flex items-center justify-between gap-2"><span className="text-[10px]  uppercase tracking-[0.16em] text-amber-400">{cardIndex + 1} / {studyCards.length}</span><span className="rounded-full border border-amber-500/40 bg-amber-500/20 px-2 py-1 text-[10px]  uppercase text-amber-400">Question</span></div>
                      <div className="max-h-[190px] overflow-y-auto break-words text-xl leading-snug text-stone-100"><MarkdownContent value={currentCard.question} /></div>
                      <div className="flex justify-center"><span className="rounded-full border border-[#394252] bg-[#171d28] px-4 py-2 text-[11px]  text-stone-300">See answer</span></div>
                    </div>
                    <div className="absolute inset-0 flex flex-col justify-between rounded-2xl p-5 [backface-visibility:hidden] [transform:rotateY(180deg)]">
                      <div className="flex items-center justify-between gap-2"><span className="text-[10px]  uppercase tracking-[0.16em] text-emerald-300">Answer</span><span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px]  uppercase text-emerald-200">Key idea</span></div>
                      <div className="max-h-[190px] overflow-y-auto break-words text-lg leading-relaxed text-stone-100"><MarkdownContent value={currentCard.answer} /></div>
                      {currentCard.explanation && (
                        <div className="max-h-16 overflow-y-auto border-t border-[#29303c] pt-2 text-xs leading-relaxed text-stone-300">
                          <MarkdownContent value={currentCard.explanation} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 rounded-xl border border-[#202631] bg-[#0c1017] p-2">
                  <button type="button" onClick={() => goToCard(cardIndex - 1)} disabled={cardIndex === 0} aria-label="Previous flashcard" className="flex h-9 w-9 items-center justify-center rounded-md border border-[#394252] text-stone-200 hover:border-amber-500/40 disabled:cursor-not-allowed disabled:opacity-40"><ArrowLeft className="h-4 w-4" /></button>
                  <button type="button" onClick={() => rateCard(false)} aria-label={`Mark incorrect, ${wrongCount} incorrect`} className="flex h-9 min-w-14 items-center justify-center gap-1.5 rounded-md border border-red-500/40 bg-red-500/10 px-2 text-xs  text-red-200"><X className="h-4 w-4" /><span>{wrongCount}</span></button>
                  <button type="button" onClick={() => rateCard(true)} aria-label={`Mark correct, ${rightCount} correct`} className="flex h-9 min-w-14 items-center justify-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 text-xs  text-emerald-200"><Check className="h-4 w-4" /><span>{rightCount}</span></button>
                  <button type="button" onClick={() => goToCard(cardIndex + 1)} disabled={cardIndex >= studyCards.length - 1} aria-label="Next flashcard" className="flex h-9 w-9 items-center justify-center rounded-md border border-[#394252] text-stone-200 hover:border-amber-500/40 disabled:cursor-not-allowed disabled:opacity-40"><ArrowRight className="h-4 w-4" /></button>
                </div>
                <DownloadMaterialButton title={currentCard.question} content={`${currentCard.question}\n\n${currentCard.answer}${currentCard.explanation ? `\n\n${currentCard.explanation}` : ""}`} />
                <p className="text-center text-[10px] text-stone-600">Space to flip · Arrow keys to navigate</p>
              </> : <p className="rounded-xl border border-dashed border-[#394252] p-6 text-center text-sm text-stone-500">Your instructor’s flashcards and saved vocabulary will appear here.</p>}
            </section>
          )}

          {tab === "quizzes" && (
            <section className="space-y-3" aria-label="Practice quizzes">
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Practice Quizzes</h3>
              {quizResources.length === 0 ? <p className="text-sm text-stone-500">Your instructor has not assigned a practice quiz yet.</p> : quizResources.map((item) => (
                <article key={item.id} className="rounded-lg border border-[#29303c] bg-[#0c1017] p-3">
                  <h4 className="mb-2 text-sm font-semibold text-stone-100">{item.title}</h4>
                  {item.body && <MarkdownContent value={item.body} className="text-sm leading-relaxed text-stone-300" />}
                  {getSafeResourceHref(item.link_url) && <a href={getSafeResourceHref(item.link_url) || undefined} target="_blank" rel="noreferrer" className="mt-3 inline-flex rounded-md border border-amber-500/40 px-3 py-2 text-xs  text-amber-400 hover:border-amber-500/40">Open practice</a>}
                  <div className="mt-3"><DownloadMaterialButton title={item.title} href={getSafeResourceHref(item.link_url)} content={item.body} /></div>
                </article>
              ))}
            </section>
          )}

          {tab === "audio" && (
            <section className="space-y-3" aria-label="Audio materials">
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Audio Materials</h3>
              {audioResources.length === 0 ? <p className="text-sm text-stone-500">Your instructor has not assigned audio materials yet.</p> : audioResources.map((item) => {
                const audioHref = getSafeResourceHref(item.link_url);
                return <article key={item.id} className="space-y-3 rounded-lg border border-[#29303c] bg-[#0c1017] p-3">
                  <h4 className="text-sm font-semibold text-stone-100">{item.title}</h4>
                  {audioHref ? <CustomAudioPlayer src={audioHref} label={item.title} /> : <p className="text-xs text-stone-500">Audio file is not available.</p>}
                  {item.body && <MarkdownContent value={item.body} className="text-xs leading-relaxed text-stone-400" />}
                  <DownloadMaterialButton title={item.title} href={audioHref} content={item.body} />
                </article>;
              })}
            </section>
          )}

          {tab === "video" && (
            <section className="space-y-3" aria-label="Video resources">
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Video Resources</h3>
              {videoResources.length === 0 ? <p className="text-sm text-stone-500">Your instructor has not added videos yet.</p> : videoResources.map((item) => {
                const videoHref = getSafeResourceHref(item.link_url);
                return <article key={item.id} className="space-y-3 rounded-lg border border-[#29303c] bg-[#0c1017] p-3">
                  <h4 className="text-sm font-semibold text-stone-100">{item.title}</h4>
                  {videoHref ? <InteractiveVideoBlock videoUrl={videoHref} title={item.title} /> : <p className="text-xs text-stone-500">Video is not available.</p>}
                  {item.body && <MarkdownContent value={item.body} className="text-xs leading-relaxed text-stone-400" />}
                  <DownloadMaterialButton title={item.title} href={videoHref} content={item.body} />
                </article>;
              })}
            </section>
          )}

          {tab === "image" && (
            <section className="space-y-3" aria-label="Image resources">
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Image Resources</h3>
              {imageResources.length === 0 ? <p className="text-sm text-stone-500">Your instructor has not added images yet.</p> : <div className="grid grid-cols-2 gap-3">{imageResources.map((item) => {
                const imageHref = getSafeResourceHref(item.link_url);
                return <article key={item.id} className="overflow-hidden rounded-lg border border-[#29303c] bg-[#0c1017]">
                  {imageHref ? <button type="button" onClick={() => setLightboxImage(item)} aria-label={`View ${item.title}`} className="block w-full text-left"><img src={imageHref} alt={item.title} className="aspect-[4/3] w-full object-cover" /></button> : <div className="aspect-[4/3] bg-[#171d28]" />}
                  <div className="space-y-2 p-3"><h4 className="text-xs font-semibold text-stone-100">{item.title}</h4>{item.body && <p className="line-clamp-3 text-[11px] leading-relaxed text-stone-400">{item.body}</p>}{imageHref && <DownloadMaterialButton title={item.title} href={imageHref} />}</div>
                </article>;
              })}</div>}
            </section>
          )}

          {tab === "files" && (
            <section className="space-y-3" aria-label="File resources">
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Shared Files</h3>
              {fileResources.length === 0 ? <p className="text-sm text-stone-500">Your instructor has not shared any files yet.</p> : fileResources.map((item) => {
                const fileHref = getSafeResourceHref(item.link_url);
                const mediaType = item.media_type || "";
                return <article key={item.id} className="space-y-3 rounded-lg border border-[#29303c] bg-[#0c1017] p-3">
                  <div><h4 className="text-sm font-semibold text-stone-100">{item.title}</h4><p className="mt-1 break-all text-[11px] text-stone-500">{item.original_filename || "File resource"}</p></div>
                  {fileHref && mediaType.startsWith("image/") && <button type="button" onClick={() => setLightboxImage(item)} aria-label={`View ${item.title}`} className="block w-full"><img src={fileHref} alt={item.original_filename || item.title} className="max-h-[420px] w-full rounded-md border border-[#29303c] object-contain" /></button>}
                  {fileHref && mediaType === "application/pdf" && <iframe src={fileHref} title={`Preview of ${item.original_filename || item.title}`} className="h-[480px] w-full rounded-md border border-[#29303c] bg-white" />}
                  {fileHref && mediaType.startsWith("text/") && <iframe src={fileHref} title={`Preview of ${item.original_filename || item.title}`} className="h-[360px] w-full rounded-md border border-[#29303c] bg-white" />}
                  {fileHref && mediaType.startsWith("audio/") && <CustomAudioPlayer src={fileHref} label={item.title} />}
                  {fileHref && mediaType.startsWith("video/") && <video src={fileHref} controls preload="metadata" className="max-h-[480px] w-full rounded-md bg-black" aria-label={`Preview of ${item.original_filename || item.title}`} />}
                  {fileHref ? <a href={fileHref} target="_blank" rel="noreferrer" download={item.original_filename || undefined} className="inline-flex rounded-md border border-amber-500/40 px-3 py-2 text-xs  text-amber-400 hover:border-amber-500/40">Open or download</a> : <p className="text-xs text-stone-500">This file is not available.</p>}
                </article>;
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
