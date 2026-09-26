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

  for (const rawLine of rawTranscript.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || /^(translator|reviewer)\s*:/i.test(line)) continue;

    const markerPattern = new RegExp(TIMESTAMP_MARKER.source, "g");
    const matches = [...line.matchAll(markerPattern)];
    if (matches.length > 0) {
      matches.forEach((match, index) => {
        const hours = match[3] ? Number(match[1]) : 0;
        const minutes = match[3] ? Number(match[2]) : Number(match[1]);
        const seconds = Number(match[3] || match[2]);
        const totalSeconds = hours * 3600 + minutes * 60 + seconds;
        const textStart = (match.index || 0) + match[0].length;
        const textEnd = index + 1 < matches.length ? matches[index + 1].index || line.length : line.length;
        const text = line.slice(textStart, textEnd).replace(/^[\s:|–—-]+/, "").trim();
        if (!text) return;
        parsedLines.push({
          timestamp: formatTimestamp(totalSeconds),
          seconds: totalSeconds,
          text,
        });
      });
      continue;
    }

    const currentLine = parsedLines[parsedLines.length - 1];
    if (currentLine) {
      currentLine.text = [currentLine.text, line].filter(Boolean).join(" ");
    }
  }

  return parsedLines.filter((line) => line.text.length > 0);
}