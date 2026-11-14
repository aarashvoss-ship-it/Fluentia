import {
  type StandardEvaluationReport,
  STANDARD_EVALUATION_HEADERS,
} from "@/lib/ai/types";

export interface AcademisMarkdownReportTable {
  headers: string[];
  rows: string[][];
  markdown: string;
}

export interface AcademisReportTableContent {
  format: "markdown_table";
  headers: string[];
  rows: string[][];
  markdown?: string;
}

export interface PreparedAcademisReport {
  reportData: Record<string, unknown>;
  publishedContent: Record<string, unknown>;
}

export function replaceAcademisBreakTags(value: string) {
  return value.replace(/<br\s*\/?>/gi, "\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function splitMarkdownRow(line: string) {
  const cells: string[] = [];
  let cell = "";
  const value = line.trim();
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "\\" && value[index + 1] === "|") {
      cell += "|";
      index += 1;
    } else if (character === "|") {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += character;
    }
  }
  cells.push(cell.trim());
  if (value.startsWith("|")) cells.shift();
  if (value.endsWith("|")) cells.pop();
  return cells.map(replaceAcademisBreakTags);
}

function isMarkdownSeparator(cells: string[]) {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

export function parseMarkdownReportTable(value: string): AcademisMarkdownReportTable | null {
  const lines = value.split(/\r?\n/);
  for (let index = 0; index < lines.length - 1; index += 1) {
    if (!lines[index].includes("|") || !lines[index + 1].includes("|")) continue;
    const headers = splitMarkdownRow(lines[index]);
    const separator = splitMarkdownRow(lines[index + 1]);
    if (!headers.length || headers.length !== separator.length || !isMarkdownSeparator(separator)) continue;

    const rows: string[][] = [];
    let end = index + 2;
    while (end < lines.length && lines[end].trim() && lines[end].includes("|")) {
      rows.push(splitMarkdownRow(lines[end]));
      end += 1;
    }
    return {
      headers,
      rows,
      markdown: lines.slice(index, end).join("\n"),
    };
  }
  return null;
}

function formatMarkdownTable(headers: string[], rows: string[][]) {
  const normalizedRows = rows.map((row) =>
    Array.from({ length: headers.length }, (_, index) => row[index] || ""));
  return [
    `| ${headers.map((cell) => cell.replace(/\|/g, "\\|")).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...normalizedRows.map((row) =>
      `| ${row.map((cell) => cell.replace(/\|/g, "\\|").replace(/\r?\n/g, " ")).join(" | ")} |`),
  ].join("\n");
}

function findStudentFacingText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const text = value.map(findStudentFacingText).filter((entry): entry is string => entry !== null);
    return text.length ? text.join("\n") : null;
  }
  if (!isRecord(value)) return null;

  const entries = Object.entries(value).filter(([key]) =>
    !/(?:instructor|teacher|lesson.?builder|internal|private|hidden)/i.test(key));
  const preferredKeys = /^(?:student(?:_facing)?(?:_feedback|_summary)?|feedback|diagnostic_table|preview|text|content)$/i;
  for (const [key, entry] of entries) {
    if (preferredKeys.test(key)) {
      const text = findStudentFacingText(entry);
      if (text !== null) return text;
    }
  }
  for (const [, entry] of entries) {
    if (typeof entry === "string") continue;
    const text = findStudentFacingText(entry);
    if (text !== null) return text;
  }
  return null;
}

export function prepareAcademisReport(
  content: string,
  standardReport: StandardEvaluationReport,
): PreparedAcademisReport {
  let parsedOutput: unknown = content;
  try {
    parsedOutput = JSON.parse(content);
  } catch {
    parsedOutput = { text: content };
  }

  const headers = [...STANDARD_EVALUATION_HEADERS];
  const tableRows = standardReport.rows.map((row) => [
    row.index,
    row.axis_score,
    row.actionable_feedback,
    row.strengths_weaknesses_diagnostics,
  ]);
  const studentHeaders = headers.slice(0, 3);
  const studentRows = tableRows.map((row) => row.slice(0, 3));
  const instructorHeaders = [headers[0], headers[3]];
  const instructorRows = tableRows.map((row) => [row[0], row[3]]);
  const reportData: Record<string, unknown> = {
    format: "markdown_table",
    raw_output: content,
    parsed_output: parsedOutput,
    standard_evaluation_report: standardReport,
    markdown_table: { headers, rows: tableRows },
    student_facing_table: { headers: studentHeaders, rows: studentRows },
    instructor_only_table: { headers: instructorHeaders, rows: instructorRows },
  };

  return {
    reportData,
    publishedContent: {
      format: "markdown_table",
      headers: studentHeaders,
      rows: studentRows,
      markdown: formatMarkdownTable(studentHeaders, studentRows),
    },
  };
}

export function getAcademisPublishedPreviewText(value: unknown) {
  if (!isRecord(value)) return "";
  if (value.format === "markdown_table" && typeof value.markdown === "string") return value.markdown;
  if (value.format === "text" && typeof value.content === "string") return replaceAcademisBreakTags(value.content);
  return replaceAcademisBreakTags(findStudentFacingText(value.content) || "");
}
