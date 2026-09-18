"use client";

import { FormEvent, useEffect, useState } from "react";
import { Bookmark, Check, Loader2, Search, Volume2 } from "lucide-react";
import type { SavedVocabularyWord } from "@/types/lesson";

interface DictionaryDefinition {
  word: string;
  partOfSpeech?: string;
  phonetic?: string;
  definition: string;
  example?: string;
  pronunciationUrl?: string;
  source: SavedVocabularyWord["source"];
}

interface InstantDictionaryLookupProps {
  onSaveWord?: (wordData: DictionaryDefinition & { savedAt: string }) => void;
  initialWord?: string;
}

const DEFAULT_WORD = "accommodation";

function cleanWord(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z'-]/g, "");
}

export default function InstantDictionaryLookup({
  onSaveWord,
  initialWord = DEFAULT_WORD,
}: InstantDictionaryLookupProps) {
  const [searchTerm, setSearchTerm] = useState(initialWord);
  const [result, setResult] = useState<DictionaryDefinition | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isSaved, setIsSaved] = useState(false);

  async function handleSearch(event?: FormEvent<HTMLFormElement>, value = searchTerm) {
    event?.preventDefault();
    const word = cleanWord(value);
    if (!word) return;

    setSearchTerm(word);
    setLoading(true);
    setError("");
    setResult(null);
    setIsSaved(false);

    try {
      const response = await fetch(`/api/dictionary?word=${encodeURIComponent(word)}`);
      if (!response.ok) throw new Error("Word not found");
      const entry = (await response.json()) as DictionaryDefinition;
      setResult(entry);
    } catch {
      setError("No definition found. Try a single English word.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (initialWord.trim()) void handleSearch(undefined, initialWord);
    // The initial lookup should only run when the component receives a new initial word.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialWord]);

  function playPronunciation() {
    if (!result) return;
    if (result.pronunciationUrl) {
      new Audio(result.pronunciationUrl).play().catch(() => undefined);
      return;
    }
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(result.word);
      utterance.lang = "en-US";
      window.speechSynthesis.speak(utterance);
    }
  }

  function saveWord() {
    if (!result || !onSaveWord) return;
    onSaveWord({ ...result, savedAt: new Date().toISOString() });
    setIsSaved(true);
  }

  return (
    <section className="w-full max-w-lg rounded-xl border border-[#394252] bg-[#171d28] p-5 text-[#e8e7e4]" aria-label="Instant dictionary lookup">
      <form onSubmit={(event) => void handleSearch(event)} className="flex gap-2">
        <label htmlFor="instant-dictionary-search" className="sr-only">Search a word</label>
        <input
          id="instant-dictionary-search"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Search a word"
          className="min-w-0 flex-1 rounded-md border border-[#394252] bg-[#0c1017] px-3 py-2 text-sm outline-none focus:border-amber-500"
        />
        <button type="submit" disabled={loading} className="inline-flex items-center gap-1.5 rounded-md bg-amber-500 px-4 py-2 text-xs font-semibold text-[#0c1017] disabled:cursor-wait disabled:opacity-70">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          Search
        </button>
      </form>

      <p className="mt-2 text-right text-xs text-slate-500">Powered by Merriam-Webster</p>

      {error && <p className="mt-5 text-center text-sm text-amber-300">{error}</p>}
      {loading && <p className="mt-5 text-center text-sm text-stone-400">Looking up {searchTerm}...</p>}

      {result && !loading && (
        <div className="mt-5 space-y-4 border-t border-[#29303c] pt-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="font-sans text-2xl text-stone-100">{result.word}</h2>
              {result.partOfSpeech && <span className="text-xs italic text-amber-400">{result.partOfSpeech}</span>}
            </div>
            {result.phonetic && <p className="mt-1 text-xs text-stone-500">{result.phonetic}</p>}
            <p className="mt-2 text-sm leading-relaxed text-stone-300">{result.definition}</p>
          </div>
          {result.example && <p className="border-l-2 border-amber-500/50 pl-3 text-sm italic leading-relaxed text-stone-400">&quot;{result.example}&quot;</p>}
          <div className="flex flex-wrap items-center gap-2 border-t border-[#29303c] pt-4">
            <button type="button" onClick={playPronunciation} className="inline-flex items-center gap-1.5 rounded-md border border-[#394252] px-3 py-2 text-xs text-stone-300 hover:border-amber-500 hover:text-amber-300">
              <Volume2 className="h-3.5 w-3.5" />
              Pronounce
            </button>
            {onSaveWord && <button type="button" disabled={isSaved} onClick={saveWord} className="inline-flex items-center gap-1.5 rounded-md bg-amber-500 px-3 py-2 text-xs font-semibold text-[#0c1017] disabled:bg-emerald-500/20 disabled:text-emerald-300">
              {isSaved ? <Check className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}
              {isSaved ? "Saved" : "Save to Vocab"}
            </button>}
          </div>
        </div>
      )}
    </section>
  );
}
