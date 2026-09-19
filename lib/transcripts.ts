export interface InteractiveTranscriptLine {
  timestamp: string;
  seconds: number;
  text: string;
}

const TIMESTAMP_LINE = /^\s*\[?(\d{1,2}):(\d{2})\]?\s*(?:[-–—]\s*)?(.*)$/;

export function parseInteractiveTranscript(rawTranscript: string): InteractiveTranscriptLine[] {
  return rawTranscript
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^(translator|reviewer)\s*:/i.test(line))
    .flatMap((line) => {
      const match = line.match(TIMESTAMP_LINE);
      if (!match || !match[3].trim()) return [];

      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      return [{
        timestamp: `${match[1]}:${match[2]}`,
        seconds: minutes * 60 + seconds,
        text: match[3].trim(),
      }];
    });
}