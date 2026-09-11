import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const word = request.nextUrl.searchParams.get("word")?.trim().toLowerCase();
  if (!word || !/^[a-z'-]+$/.test(word)) return NextResponse.json({ error: "Invalid word" }, { status: 400 });

  const key = process.env.NEXT_PUBLIC_MERRIAM_WEBSTER_API_KEY;
  const localFallbacks: Record<string, { partOfSpeech: string; definition: string; example: string; phonetic?: string }> = {
    habit: { partOfSpeech: "noun", definition: "A settled tendency or usual manner of behavior.", example: "A morning habit can make the day easier to begin." },
    architecture: { partOfSpeech: "noun", definition: "The design and structure of a system or environment.", example: "The architecture of a routine can reduce friction." },
    friction: { partOfSpeech: "noun", definition: "Resistance or difficulty that makes an action harder to begin or complete.", example: "Removing friction makes a useful behavior more likely." },
    outcome: { partOfSpeech: "noun", definition: "Something that happens as a result or consequence of an action or event.", example: "The outcome of the experiment surprised the researchers." },
  };
  if (key) {
    try {
      const response = await fetch(`https://www.dictionaryapi.com/api/v3/references/collegiate/json/${encodeURIComponent(word)}?key=${key}`, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(4000) });
      const data = await response.json();
      const first = Array.isArray(data) ? data.find((item: { shortdef?: string[] }) => item && typeof item === "object" && item.shortdef?.length) : null;
      if (first) {
        const sound = first.hwi?.prs?.find((pronunciation: { sound?: { audio?: string } }) => pronunciation.sound?.audio)?.sound?.audio;
        const audioPath = sound?.startsWith("bix") ? "bix" : sound?.startsWith("gg") ? "gg" : /^\d/.test(sound || "") ? "number" : sound?.[0];
        return NextResponse.json({
          word,
          partOfSpeech: first.fl,
          definition: first.shortdef[0],
          example: first.et?.[0]?.[1],
          phonetic: first.hwi?.prs?.[0]?.mw,
          pronunciationUrl: sound && audioPath ? `https://media.merriam-webster.com/audio/prons/en/us/mp3/${audioPath}/${sound}.mp3` : undefined,
          source: "merriam-webster",
        });
      }
    } catch {
      // Fall through to the public dictionary if Merriam-Webster is unavailable.
    }
  }

  try {
    const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(4000) });
    if (!response.ok) {
      const fallback = localFallbacks[word];
      return fallback ? NextResponse.json({ word, ...fallback, source: "free-dictionary" }) : NextResponse.json({ error: "Word not found" }, { status: 404 });
    }
    const data = await response.json();
    const meaning = data[0]?.meanings?.[0];
    const definition = meaning?.definitions?.[0];
    if (!definition) return NextResponse.json({ error: "Word not found" }, { status: 404 });
    return NextResponse.json({
      word: data[0].word || word,
      partOfSpeech: meaning.partOfSpeech,
      definition: definition.definition,
      example: definition.example,
      phonetic: data[0].phonetic || data[0].phonetics?.find((item: { text?: string }) => item.text)?.text,
      pronunciationUrl: data[0].phonetics?.find((item: { audio?: string }) => item.audio)?.audio,
      source: "free-dictionary",
    });
  } catch {
    const fallback = localFallbacks[word];
    if (fallback) return NextResponse.json({ word, ...fallback, source: "free-dictionary" });
    return NextResponse.json({ error: "Dictionary service unavailable" }, { status: 503 });
  }
}
