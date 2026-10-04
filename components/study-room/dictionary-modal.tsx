"use client";

import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { BookOpen, Check, ExternalLink, Volume2, X } from "lucide-react";
import { SavedVocabularyWord } from "@/types/lesson";

interface DictionaryEntry {
  word: string;
  partOfSpeech?: string;
  phonetic?: string;
  definition: string;
  example?: string;
  pronunciationUrl?: string;
  source: SavedVocabularyWord["source"];
}

interface DictionaryModalProps {
  initialWord?: string;
  anchor?: { top: number; right: number; bottom: number; left: number } | null;
  onClose: () => void;
  savedWords: SavedVocabularyWord[];
  onSave: (word: SavedVocabularyWord) => void;
}

export function DictionaryModal({ initialWord = "", anchor = null, onClose, savedWords, onSave }: DictionaryModalProps) {
  const [query, setQuery] = useState(initialWord);
  const [entry, setEntry] = useState<DictionaryEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [popoverPosition, setPopoverPosition] = useState<{ top: number; left: number } | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const dialogRef = useRef<HTMLElement | null>(null);
  const dragOffset = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const closeTimer = useRef<number | null>(null);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const positionInitially = () => {
      const margin = 16;
      const { width, height } = dialog.getBoundingClientRect();
      const maxLeft = Math.max(margin, window.innerWidth - width - margin);
      const maxTop = Math.max(margin, window.innerHeight - height - margin);

      if (!anchor) {
        setPopoverPosition({
          top: Math.max(margin, Math.min(window.innerHeight * 0.45 - height / 2, maxTop)),
          left: Math.max(margin, Math.min((window.innerWidth - width) / 2, maxLeft)),
        });
        return;
      }

      const right = anchor.right + 12;
      const left = anchor.left - width - 12;
      const top = Math.max(margin, Math.min(anchor.top, maxTop));
      if (right + width <= window.innerWidth - margin) {
        setPopoverPosition({ top, left: right });
      } else if (left >= margin) {
        setPopoverPosition({ top, left });
      } else {
        const below = anchor.bottom + 12;
        const above = anchor.top - height - 12;
        const verticalTop = below + height <= window.innerHeight - margin
          ? below
          : above >= margin ? above : top;
        setPopoverPosition({ top: Math.max(margin, Math.min(verticalTop, maxTop)), left: Math.max(margin, Math.min(anchor.left, maxLeft)) });
      }
    };

    positionInitially();
    const handleResize = () => {
      const bounds = dialog.getBoundingClientRect();
      setPopoverPosition((position) => {
        if (!position) return position;
        return {
          top: Math.max(16, Math.min(position.top, window.innerHeight - bounds.height - 16)),
          left: Math.max(16, Math.min(position.left, window.innerWidth - bounds.width - 16)),
        };
      });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [anchor]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setIsVisible(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
  }, []);

  const requestClose = () => {
    if (closeTimer.current !== null) return;
    setIsVisible(false);
    closeTimer.current = window.setTimeout(onClose, 180);
  };

  const handleDragStart = (event: ReactPointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;
    const bounds = dialogRef.current?.getBoundingClientRect();
    if (!bounds) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setPopoverPosition({ top: bounds.top, left: bounds.left });
    dragOffset.current = { pointerId: event.pointerId, x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };

  const handleDragMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (dragOffset.current?.pointerId !== event.pointerId || !dialogRef.current) return;
    const bounds = dialogRef.current.getBoundingClientRect();
    const margin = 8;
    const left = Math.max(margin, Math.min(event.clientX - dragOffset.current.x, window.innerWidth - bounds.width - margin));
    const top = Math.max(margin, Math.min(event.clientY - dragOffset.current.y, window.innerHeight - bounds.height - margin));
    setPopoverPosition({ top, left });
  };

  const handleDragEnd = (event: ReactPointerEvent<HTMLElement>) => {
    if (dragOffset.current?.pointerId !== event.pointerId) return;
    dragOffset.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  async function lookup(word = query) {
    const cleanWord = word.trim().toLowerCase().replace(/[^a-z\-']/g, "");
    if (!cleanWord) return;
    setLoading(true);
    setError("");
    setEntry(null);
    try {
      const response = await fetch(`/api/dictionary?word=${encodeURIComponent(cleanWord)}`);
      if (!response.ok) throw new Error("Word not found");
      setEntry(await response.json() as DictionaryEntry);
    } catch {
      setError("No definition found. Try a single English word.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!initialWord) return;
    setQuery(initialWord);
    void lookup(initialWord);
  }, [initialWord]);

  const isSaved = entry ? savedWords.some((word) => word.word.toLowerCase() === entry.word.toLowerCase()) : false;
  const isPopover = Boolean(anchor);

  return (
    <div
      className={`fixed inset-0 z-[1300] ${isPopover ? "bg-transparent" : "bg-black/60"} transition-colors duration-200 ${isVisible ? "opacity-100" : "opacity-0"}`}
      onClick={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) requestClose();
      }}
      role="presentation"
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal={!isPopover}
        aria-label="Dictionary lookup"
        onClick={(event) => event.stopPropagation()}
        style={popoverPosition ? { top: popoverPosition.top, left: popoverPosition.left } : { top: "45%", left: "50%", transform: "translate(-50%, -50%)" }}
        className={`fixed max-h-[calc(100dvh-2rem)] w-[min(28rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-[#394252] bg-[#171d28] p-5 text-[#e8e7e4] shadow-2xl transition-opacity duration-200 ease-out ${isVisible ? "opacity-100" : "opacity-0"}`}
      >
        <div
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          onPointerCancel={handleDragEnd}
          className="flex cursor-grab touch-none items-center justify-between border-b border-[#29303c] pb-3 active:cursor-grabbing"
          aria-label="Drag dictionary"
        >
          <div className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-amber-400" /><h2 className="font-sans text-xl">Dictionary</h2></div>
          <button type="button" onClick={requestClose} aria-label="Close dictionary" className="cursor-pointer text-stone-400 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={(event) => { event.preventDefault(); void lookup(); }} className="mt-4 flex gap-2">
          <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search a word" className="min-w-0 flex-1 rounded-md border border-[#394252] bg-[#0c1017] px-3 py-2 text-sm outline-none focus:border-amber-500/40" />
          <button type="submit" className="rounded-md bg-amber-500/20 px-4 py-2 text-xs  text-amber-400">Search</button>
        </form>
        <p className="mt-2 text-right text-xs text-slate-500">Powered by Merriam-Webster</p>
        {loading && <p className="py-8 text-center text-sm text-stone-400">Looking up “{query}”...</p>}
        {error && <p className="py-8 text-center text-sm text-amber-400">{error}</p>}
        {entry && !loading && <div className="space-y-4 pt-4">
          <div><div className="flex items-center gap-2"><h3 className="font-sans text-2xl text-stone-100">{entry.word}</h3>{entry.partOfSpeech && <span className="text-xs italic text-amber-400">{entry.partOfSpeech}</span>}{entry.pronunciationUrl && <button type="button" onClick={() => { const a = new Audio(entry.pronunciationUrl!); void a.play(); }} aria-label="Play pronunciation" className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-amber-500/40 bg-[#0c1017] text-amber-400 hover:bg-amber-500/20"><Volume2 className="h-3.5 w-3.5" /></button>}</div>{entry.phonetic && <p className="mt-1 text-xs text-stone-500">{entry.phonetic}</p>}<p className="mt-2 text-sm leading-relaxed text-stone-300">{entry.definition}</p></div>
          {entry.example && <p className="border-l-2 border-amber-500/40 pl-3 text-sm italic leading-relaxed text-stone-400">“{entry.example}”</p>}
          <div className="flex justify-start border-t border-[#29303c] pt-4">
            <button type="button" disabled={isSaved} onClick={() => onSave({ ...entry, savedAt: new Date().toISOString() })} className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-amber-500/20 px-4 py-2.5 text-sm text-amber-400 shadow-md transition hover:bg-amber-500/20 disabled:bg-emerald-500/20 disabled:text-emerald-300">{isSaved ? <Check className="h-4 w-4" /> : "+"}{isSaved ? "Saved" : "Save to Vocab"}</button>
          </div>
          <a href={`https://www.merriam-webster.com/dictionary/${entry.word}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-stone-500 hover:text-amber-400">Open full dictionary entry <ExternalLink className="h-3 w-3" /></a>
        </div>}
      </section>
    </div>
  );
}
