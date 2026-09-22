export const FILL_IN_BLANKS_PATTERN = /\[([^\]]+)\]/g;

export interface FillInBlank {
  answer: string;
  start: number;
  end: number;
}

export function parseFillInBlanks(text: string): FillInBlank[] {
  const blanks: FillInBlank[] = [];
  for (const match of text.matchAll(FILL_IN_BLANKS_PATTERN)) {
    const rawAnswer = match[1].trim();
    const answer = rawAnswer.replace(/^blank\s*:\s*/i, "").trim();
    if (!answer) continue;
    const start = match.index ?? 0;
    blanks.push({ answer, start, end: start + match[0].length });
  }
  return blanks;
}

export function normalizeFillInBlankAnswer(value: string, caseSensitive: boolean): string {
  const normalized = value.trim();
  return caseSensitive ? normalized : normalized.toLocaleLowerCase();
}

export function isFillInBlankAnswerCorrect(
  value: string,
  acceptableAnswers: string[],
  caseSensitive = false,
): boolean {
  const normalizedValue = normalizeFillInBlankAnswer(value, caseSensitive);
  return acceptableAnswers.some(
    (answer) => normalizeFillInBlankAnswer(answer, caseSensitive) === normalizedValue,
  );
}
