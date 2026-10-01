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
  const normalized = rawTranscript.replace(/\r/g, "").trim();
  if (!normalized) return [];

  const timestampPattern = /\[?(\d{1,2}:\d{2}(?::\d{2})?)(?:[,.]\d{1,3})?\]?/g;
  const parsedLines: InteractiveTranscriptLine[] = [];

  normalized.split("\n").forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line || /^(translator|reviewer)\s*:/i.test(line) || /^WEBVTT$/i.test(line) || /^\d+$/.test(line)) return;

    const matches: RegExpExecArray[] = [];
    timestampPattern.lastIndex = 0;
    let timestampMatch: RegExpExecArray | null;
    while ((timestampMatch = timestampPattern.exec(line)) !== null) matches.push(timestampMatch);
    if (matches.length === 0) {
      const previousLine = parsedLines[parsedLines.length - 1];
      if (previousLine) previousLine.text = [previousLine.text, line].filter(Boolean).join(" ");
      return;
    }

    const isCueRange = matches.length > 1 && line.slice(matches[0].index! + matches[0][0].length, matches[1].index).includes("-->");
    const timestampMatches = isCueRange ? [matches[0]] : matches;
    timestampMatches.forEach((match, index) => {
      const timestampText = match[1];
      const timestampSegments = timestampText.split(":").map(Number);
      const totalSeconds = timestampSegments.length === 3
        ? timestampSegments[0] * 3600 + timestampSegments[1] * 60 + timestampSegments[2]
        : timestampSegments[0] * 60 + timestampSegments[1];
      const contentStart = isCueRange ? matches[1].index! + matches[1][0].length : match.index! + match[0].length;
      const nextTimestampIndex = timestampMatches[index + 1]?.index ?? line.length;
      const text = line.slice(contentStart, nextTimestampIndex).replace(/^\s*-->/, "").trim();
      parsedLines.push({ timestamp: formatTimestamp(totalSeconds), seconds: totalSeconds, text });
    });
  });

  return parsedLines.filter((line) => line.text.length > 0);
}