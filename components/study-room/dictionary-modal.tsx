"use client";

import { useEffect, useState } from "react";
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
  onClose: () => void;
  savedWords: SavedVocabularyWord[];
  onSave: (word: SavedVocabularyWord) => void;
}

export function DictionaryModal({ initialWord = "", onClose, savedWords, onSave }: DictionaryModalProps) {
  const [query, setQuery] = useState(initialWord);
  const [entry, setEntry] = useState<DictionaryEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} role="dialog" aria-modal="true" aria-label="Dictionary lookup">
      <div className="w-full max-w-lg rounded-xl border border-[#394252] bg-[#171d28] p-5 text-[#e8e7e4] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#29303c] pb-3">
          <div className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-amber-400" /><h2 className="font-[var(--font-fraunces)] text-xl">Dictionary</h2></div>
          <button type="button" onClick={onClose} aria-label="Close dictionary" className="text-stone-400 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={(event) => { event.preventDefault(); void lookup(); }} className="mt-4 flex gap-2">
          <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search a word" className="min-w-0 flex-1 rounded-md border border-[#394252] bg-[#0c1017] px-3 py-2 text-sm outline-none focus:border-amber-500" />
          <button type="submit" className="rounded-md bg-amber-500 px-4 py-2 text-xs font-semibold text-[#0c1017]">Search</button>
        </form>
        <div className="mt-4 border-b border-[#29303c] pb-3">
          <img src="/images/mw-logo.svg" alt="Merriam-Webster" className="h-5 w-auto object-contain" />
        </div>
        {loading && <p className="py-8 text-center text-sm text-stone-400">Looking up “{query}”...</p>}
        {error && <p className="py-8 text-center text-sm text-amber-300">{error}</p>}
        {entry && !loading && <div className="space-y-4 pt-4">
          <div><div className="flex items-center gap-3"><h3 className="font-[var(--font-fraunces)] text-2xl text-stone-100">{entry.word}</h3>{entry.partOfSpeech && <span className="text-xs italic text-amber-400">{entry.partOfSpeech}</span>}</div>{entry.phonetic && <p className="mt-1 text-xs text-stone-500">{entry.phonetic}</p>}<p className="mt-2 text-sm leading-relaxed text-stone-300">{entry.definition}</p></div>
          {entry.example && <p className="border-l-2 border-amber-500/50 pl-3 text-sm italic leading-relaxed text-stone-400">“{entry.example}”</p>}
          <div className="flex flex-col gap-3 border-t border-[#29303c] pt-4 sm:flex-row sm:items-center">
            {entry.pronunciationUrl && <audio controls src={entry.pronunciationUrl} className="h-8 min-w-0 flex-1" aria-label="Audio pronunciation" />}
            {entry.pronunciationUrl && <Volume2 className="h-4 w-4 shrink-0 text-amber-400" />}
            <button type="button" disabled={isSaved} onClick={() => onSave({ ...entry, savedAt: new Date().toISOString() })} className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-bold text-[#0c1017] shadow-md transition hover:bg-amber-400 disabled:bg-emerald-500/20 disabled:text-emerald-300">{isSaved ? <Check className="h-4 w-4" /> : "+"}{isSaved ? "Saved" : "Save to Vocab"}</button>
          </div>
          <a href={`https://www.merriam-webster.com/dictionary/${entry.word}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-stone-500 hover:text-amber-300">Open full dictionary entry <ExternalLink className="h-3 w-3" /></a>
        </div>}
      </div>
    </div>
  );
}
