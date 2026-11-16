import { parseMarkdownReportTable, replaceAcademisBreakTags } from "@/lib/academis-report";
import { STANDARD_EVALUATION_HEADERS } from "@/lib/ai/types";

export const ACADEMIS_DIAGNOSTIC_HEADERS = STANDARD_EVALUATION_HEADERS;

export interface AcademisDiagnosticRow {
  index: string;
  status_axis: string;
  student_feedback: string;
  instructor_diagnostic: string;
}

export interface AcademisDiagnosticTable {
  markdown: string;
  rows: AcademisDiagnosticRow[];
}

export interface ParsedAcademisDiagnosticTable {
  criteriaScores: Record<string, number | null>;
  diagnosticTable: AcademisDiagnosticTable;
}

const MAX_DIAGNOSTIC_ROWS = 40;
const STATUS_MARKER_GLOBAL_PATTERN = /(?:^|[\s([{,:;])([+-])(?=$|[\s)\]},;:.])/g;

export function extractAcademisPercentageScore(value: string) {
  const scorePattern = "((?:100|[1-9]?\\d)(?:\\.\\d+)?)";
  const percent = value.match(new RegExp(`\\b${scorePattern}\\s*(?:%|percent\\b)`, "i"));
  const fraction = value.match(new RegExp(`\\b${scorePattern}\\s*\\/\\s*100\\b`, "i"));
  const labeledScore = value.match(new RegExp(`\\b(?:percentage\\s*)?score\\s*[:=]?\\s*${scorePattern}\\b`, "i"));
  const score = percent || fraction || labeledScore;
  if (!score) return undefined;
  const numericScore = Number(score[1]);
  return numericScore >= 0 && numericScore <= 100 ? numericScore : undefined;
}

export function extractAcademisCriterionLabel(value: string) {
  return value
    .replace(/\b(?:percentage\s*)?score\s*[:=]?\s*(?:100|[1-9]?\d)(?:\.\d+)?\s*(?:%|percent\b)?/gi, " ")
    .replace(/\b(?:100|[1-9]?\d)(?:\.\d+)?\s*(?:%|percent\b|\/\s*(?:100|9)\b)/gi, " ")
    .replace(/\s+(?:100|[1-9]?\d)(?:\.\d+)?\s*[+-]\s*$/g, "")
    .replace(STATUS_MARKER_GLOBAL_PATTERN, " ")
    .replace(/^[\s:;,()[\]{}—–-]+|[\s:;,()[\]{}—–-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseAcademisCriterionScores(
  rows: Array<{ index: string; status_axis: string; score?: number | null }>,
) {
  const scores: Record<string, number | null> = {};
  const usedKeys = new Set<string>();
  rows.forEach((row, index) => {
    const rowIndex = row.index.trim() || String(index + 1);
    const axis = replaceAcademisBreakTags(row.status_axis);
    const label = extractAcademisCriterionLabel(axis) || `Criterion ${rowIndex}`;
    let key = label;
    if (usedKeys.has(key.toLocaleLowerCase())) key = `${label} (${rowIndex})`;
    usedKeys.add(key.toLocaleLowerCase());
    scores[key] = row.score === undefined
      ? extractAcademisPercentageScore(axis) ?? null
      : typeof row.score === "number"
        && Number.isInteger(row.score)
        && row.score >= 0
        && row.score <= 100
        ? row.score
        : null;
  });
  return scores;
}

export function calculateAcademisScoreMean(scores: Record<string, number | null>) {
  const numericScores = Object.values(scores).filter((score): score is number => (
    typeof score === "number" && Number.isFinite(score)
  ));
  return numericScores.length
    ? Math.round(numericScores.reduce((sum, score) => sum + score, 0) / numericScores.length * 100) / 100
    : null;
}

export function formatAcademisDiagnosticTable(
  rows: AcademisDiagnosticRow[],
  includeInstructorColumn: boolean,
) {
  const columnCount = includeInstructorColumn ? 4 : 3;
  const headers = ACADEMIS_DIAGNOSTIC_HEADERS.slice(0, columnCount);
  const escapeCell = (value: string) => value.replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim();
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => {
      const cells = [row.index, row.status_axis, row.student_feedback, row.instructor_diagnostic]
        .slice(0, columnCount)
        .map(escapeCell);
      return `| ${cells.join(" | ")} |`;
    }),
  ].join("\n");
}

export function parseAcademisDiagnosticTable(
  value: unknown,
): ParsedAcademisDiagnosticTable | null {
  let headers: string[];
  let sourceRows: unknown[];
  if (typeof value === "string") {
    const parsedTable = parseMarkdownReportTable(value.trim());
    if (!parsedTable) return null;
    headers = parsedTable.headers;
    sourceRows = parsedTable.rows;
  } else if (value !== null && typeof value === "object" && !Array.isArray(value)
    && "headers" in value && "rows" in value
    && Array.isArray(value.headers) && Array.isArray(value.rows)) {
    headers = value.headers.map((header) => typeof header === "string" ? header : "");
    sourceRows = value.rows;
  } else {
    return null;
  }
  if (headers.length < 3 || sourceRows.length === 0
    || !headers.slice(0, 3).every((header) => header.trim())) return null;

  const normalizedRows = sourceRows.slice(0, MAX_DIAGNOSTIC_ROWS).flatMap((row) => {
    if (!Array.isArray(row)) return [];
    const cells = row.map((cell) => typeof cell === "string"
      ? cell
      : typeof cell === "number" || typeof cell === "boolean" ? String(cell) : "");
    if (cells.length > 4) cells.splice(3, cells.length - 3, cells.slice(3).join(" | "));
    while (cells.length < 4) cells.push("");
    return [cells];
  });
  if (!normalizedRows.length) return null;

  const rows: AcademisDiagnosticRow[] = [];
  const scores: Array<[string, number | null]> = [];
  const usedIndexes = new Set<string>();
  const usedCriteria = new Set<string>();
  for (const [index, cells] of normalizedRows.entries()) {
    if (cells[1].length > 300 || cells[2].length > 1200 || cells[3].length > 2400) return null;
    const reportedScore = extractAcademisPercentageScore(cells[1]);
    let rowIndex = cells[0].trim() || String(index + 1);
    if (usedIndexes.has(rowIndex)) rowIndex = `${rowIndex}-${index + 1}`;
    usedIndexes.add(rowIndex);
    const criterion = extractAcademisCriterionLabel(cells[1]) || `Criterion ${rowIndex}`;
    if (criterion.length > 120) return null;
    let scoreKey = criterion;
    if (usedCriteria.has(scoreKey.toLowerCase())) scoreKey = `${criterion} (${rowIndex})`;
    if (usedCriteria.has(scoreKey.toLowerCase())) return null;
    usedCriteria.add(scoreKey.toLowerCase());
    scores.push([scoreKey, reportedScore ?? null]);
    rows.push({
      index: rowIndex,
      status_axis: `${criterion}${reportedScore === undefined ? "" : ` (${reportedScore}%)`}`,
      student_feedback: cells[2].trim(),
      instructor_diagnostic: cells[3].trim(),
    });
  }
  return {
    criteriaScores: Object.fromEntries(scores),
    diagnosticTable: {
      rows,
      markdown: formatAcademisDiagnosticTable(rows, true),
    },
  };
}
