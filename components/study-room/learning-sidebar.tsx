"use client";

import { useEffect, useState } from "react";
import { BookMarked, FileText, Library, Layers3, Trash2, X } from "lucide-react";
import { SavedVocabularyWord, StudentNote } from "@/types/lesson";

interface LearningSidebarProps {
  open: boolean;
  words: SavedVocabularyWord[];
  notes: StudentNote[];
  resource?: string;
  resources?: { id: string; title: string; url: string; type: string }[];
  onClose: () => void;
  onSaveNote: (note: StudentNote) => void;
  onRemoveWord: (word: string) => void;
}

export function LearningSidebar({ open, words, notes, resource, resources, onClose, onSaveNote, onRemoveWord }: LearningSidebarProps) {
  const [tab, setTab] = useState<"vocab" | "notes" | "resources" | "cards">("vocab");
  const [cardIndex, setCardIndex] = useState(0);
  const [showDefinition, setShowDefinition] = useState(false);
  const currentCard = words[cardIndex % Math.max(words.length, 1)];

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const tabs = [
    ["vocab", "Vocab", BookMarked],
    ["notes", "Notes", FileText],
    ["resources", "Resources", Library],
    ["cards", "Cards", Layers3],
  ] as const;

  return (
    <>
      <button
        type="button"
        aria-label="Close Learning Hub"
        aria-hidden={!open}
        tabIndex={open ? 0 : -1}
        onClick={onClose}
        className={`fixed inset-0 z-20 bg-black/55 transition-opacity duration-200 ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />
      <aside className={`fixed bottom-0 right-0 top-0 z-30 flex w-full max-w-sm flex-col border-l border-[#29303c] bg-[#121721] shadow-2xl transition-transform duration-200 sm:w-[360px] ${open ? "translate-x-0" : "translate-x-full"}`} id="learning-sidebar" aria-hidden={!open}>
      <div className="flex items-start justify-between border-b border-[#29303c] p-5"><div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-400">Learning Hub</p><h2 className="mt-1 font-[var(--font-fraunces)] text-2xl text-stone-100">Your study tools</h2></div><button type="button" onClick={onClose} aria-label="Close Learning Hub" tabIndex={open ? 0 : -1} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#394252] text-stone-400 transition hover:border-amber-500 hover:text-amber-300"><X className="h-5 w-5" /></button></div>
      <div className="grid grid-cols-4 border-b border-[#29303c]">{tabs.map(([id, label, Icon]) => <button key={id} type="button" onClick={() => setTab(id)} className={`flex flex-col items-center gap-1 px-2 py-3 text-[10px] ${tab === id ? "border-b-2 border-amber-500 text-amber-300" : "text-stone-500 hover:text-stone-300"}`}><Icon className="h-4 w-4" />{label}</button>)}</div>
      <div className="flex-1 overflow-y-auto p-5">
        {tab === "vocab" && <div className="space-y-3">{words.length === 0 ? <p className="text-sm text-stone-500">Double-click any lesson word to save it here.</p> : words.map((word) => <div key={word.word} className="rounded-lg border border-[#29303c] bg-[#0c1017] p-3"><div className="flex items-start justify-between gap-2"><div><p className="font-semibold text-stone-100">{word.word}</p><p className="mt-1 text-xs text-amber-300">{word.partOfSpeech}</p></div><button type="button" onClick={() => onRemoveWord(word.word)} aria-label={`Remove ${word.word}`} className="text-stone-600 hover:text-red-300"><Trash2 className="h-3.5 w-3.5" /></button></div><p className="mt-2 text-xs leading-relaxed text-stone-400">{word.definition}</p>{word.example && <p className="mt-2 text-xs italic text-stone-500">{word.example}</p>}</div>)}</div>}
        {tab === "notes" && <div className="space-y-3"><textarea defaultValue={notes[0]?.text || ""} onChange={(event) => onSaveNote({ id: notes[0]?.id || "personal", text: event.target.value, updatedAt: new Date().toISOString() })} placeholder="Your personal notes auto-save as you type..." rows={12} className="w-full resize-none rounded-lg border border-[#29303c] bg-[#0c1017] p-3 text-sm leading-relaxed text-stone-200 outline-none focus:border-amber-500" /><p className="text-[10px] text-stone-600">Auto-saved locally for this student.</p></div>}
        {tab === "resources" && (resources && resources.length > 0 ? <div className="space-y-2">{resources.map((r) => (<a key={r.id} href={r.url} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-lg border border-[#202631] bg-[#0c1017] px-3 py-2.5 text-xs text-stone-300 hover:border-amber-500/40 hover:text-amber-300"><span className="min-w-0 flex-1 truncate font-medium">{r.title || r.url}</span><span className="ml-2 shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-amber-400">{r.type}</span></a>))}</div> : resource ? <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 text-sm leading-relaxed text-stone-300">{resource}</div> : <><p className="text-sm text-stone-500">Your instructor has not prescribed a resource yet.</p><div className="rounded-lg border border-[#29303c] bg-[#0c1017] p-4"><p className="text-xs font-semibold text-amber-300">Study Hub</p><p className="mt-2 text-xs leading-relaxed text-stone-500">Instructor recommendations and lesson resources will appear here.</p></div></>)}
        {tab === "cards" && <div className="space-y-4">{currentCard ? <><button type="button" onClick={() => setShowDefinition(!showDefinition)} className="flex min-h-48 w-full items-center justify-center rounded-xl border border-amber-500/30 bg-[#0c1017] p-6 text-center"><span className="font-[var(--font-fraunces)] text-3xl text-stone-100">{showDefinition ? currentCard.definition : currentCard.word}</span></button><div className="flex justify-between"><button type="button" onClick={() => { setCardIndex((index) => Math.max(0, index - 1)); setShowDefinition(false); }} className="text-xs text-stone-400">Previous</button><span className="text-xs text-stone-600">{(cardIndex % words.length) + 1} / {words.length}</span><button type="button" onClick={() => { setCardIndex((index) => index + 1); setShowDefinition(false); }} className="text-xs text-amber-300">Next</button></div></> : <p className="text-sm text-stone-500">Save vocabulary words to start reviewing cards.</p>}</div>}
      </div>
      </aside>
    </>
  );
}
