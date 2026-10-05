export const FILL_IN_BLANKS_PATTERN = /\[([^\]]+)\]/g;

export interface FillInBlank {
  answer: string;
  start: number;
  end: number;
}

export function getQuizQuestionPrompt(question: {
  prompt?: string | null;
  text?: string | null;
  question?: string | null;
}): string {
  return [question.text, question.prompt, question.question]
    .find((value) => typeof value === "string" && value.trim().length > 0) || "";
}

export function parseFillInBlanks(text: string): FillInBlank[] {
  const plainText = /<\/?[a-z][\s\S]*>/i.test(text)
    ? typeof DOMParser !== "undefined"
      ? new DOMParser().parseFromString(text, "text/html").body.textContent || ""
      : text
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(?:p|h[1-6]|li|blockquote|div|pre|tr)>/gi, "\n")
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
    : text;
  const blanks: FillInBlank[] = [];
  for (const match of plainText.matchAll(FILL_IN_BLANKS_PATTERN)) {
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
