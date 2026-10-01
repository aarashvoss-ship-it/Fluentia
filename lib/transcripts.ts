export interface InteractiveTranscriptLine {
  timestamp: string;
  seconds: number;
  text: string;
}

const TIMESTAMP_MARKER = /\[?(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*[-–—]\s*\[?(\d{1,2}):(\d{2})(?::(\d{2}))?\]?)?\]?\s*/g;

function formatTimestamp(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function parseInteractiveTranscript(rawTranscript: string): InteractiveTranscriptLine[] {
  const parsedLines: InteractiveTranscriptLine[] = [];
  const normalized = rawTranscript.replace(/\r/g, "").trim();
  if (!normalized) return [];

  const timestampPattern = /(?:(?:\[)?(\d{1,2}:\d{2})(?::(\d{2}))?(?:\])?|(?:\b\d{1,2}:\d{2}:\d{2}\b)|(?:\b\d{1,2}:\d{2}\b))/g;

  const entries = normalized.split(/\n+/).flatMap((rawLine) => {
    const line = rawLine.trim();
    if (!line || /^(translator|reviewer)\s*:/i.test(line)) return [];

    const matches = [...line.matchAll(timestampPattern)];
    if (matches.length === 0) return [line];

    const parts: string[] = [];
    let lastIndex = 0;
    matches.forEach((match) => {
      const matchIndex = match.index ?? 0;
      const prefix = line.slice(lastIndex, matchIndex).trim();
      if (prefix) parts.push(prefix);
      const timestampText = match[0].replace(/[\[\]]/g, "").trim();
      const timestampSegments = timestampText.split(":").map((segment) => segment.trim());
      const hasHours = timestampSegments.length === 3;
      const hours = hasHours ? Number(timestampSegments[0]) : 0;
      const minutes = hasHours ? Number(timestampSegments[1]) : Number(timestampSegments[0]);
      const seconds = hasHours ? Number(timestampSegments[2]) : Number(timestampSegments[1]);
      const totalSeconds = hours * 3600 + minutes * 60 + seconds;
      const remaining = line.slice(matchIndex + match[0].length).trim();
      if (remaining) parts.push(`${timestampText} ${remaining}`);
      if (timestampText) {
        parsedLines.push({
          timestamp: formatTimestamp(totalSeconds),
          seconds: totalSeconds,
          text: remaining || "",
        });
      }
      lastIndex = matchIndex + match[0].length;
    });

    if (lastIndex < line.length) {
      const tail = line.slice(lastIndex).trim();
      if (tail) parts.push(tail);
    }

    if (parts.length === 0) return [];
    return parts;
  });

  if (parsedLines.length > 0) {
    const grouped: InteractiveTranscriptLine[] = [];
    let lastEntry: InteractiveTranscriptLine | null = null;
    for (const segment of entries) {
      const match = segment.match(/^(\d{1,2}:\d{2}(?::\d{2})?)\s*(.*)$/);
      if (match) {
        const [, timeText, text] = match;
        const cleanText = text.trim();
        const [hoursPart, minutesPart, secondsPart] = timeText.split(":").map((segmentValue) => Number(segmentValue));
        const totalSeconds = (hoursPart || 0) * 3600 + (minutesPart || 0) * 60 + (secondsPart ?? 0);
        if (cleanText) {
          grouped.push({ timestamp: formatTimestamp(totalSeconds), seconds: totalSeconds, text: cleanText });
          lastEntry = grouped[grouped.length - 1];
        }
      } else if (lastEntry && segment.trim()) {
        lastEntry.text = [lastEntry.text, segment.trim()].filter(Boolean).join(" ");
      }
    }
    return grouped.length > 0 ? grouped : parsedLines.filter((line) => line.text.length > 0);
  }

  return parsedLines.filter((line) => line.text.length > 0);
}