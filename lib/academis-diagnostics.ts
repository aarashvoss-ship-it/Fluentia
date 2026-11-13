export const ACADEMIS_DIAGNOSTIC_HEADERS = [
  "Row / Index",
  "Status & Evaluation Axis (+ / - indicators)",
  "Actionable Feedback for the Student",
  "Deep Diagnostic Analysis for Instructors and the Lesson Builder (hidden from the student view)",
] as const;

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
const STATUS_MARKER_PATTERN = /(?:^|[\s([{,:;])([+-])(?=$|[\s)\]},;:.])/;
const STATUS_MARKER_GLOBAL_PATTERN = /(?:^|[\s([{,:;])([+-])(?=$|[\s)\]},;:.])/g;

function extractBandScore(value: string) {
  const fraction = value.match(/\b([1-9])\s*(?:\/\s*9|out\s+of\s+9)\b/i);
  if (fraction) return Number(fraction[1]);
  const band = value.match(/\bband\s*([1-9])\b/i);
  if (band) return Number(band[1]);
  const labeledScore = value.match(/\b(?:band\s*)?score\s*[:=]?\s*([1-9])\b/i);
  return labeledScore ? Number(labeledScore[1]) : undefined;
}

function extractCriterionLabel(value: string) {
  return value
    .replace(/\b(?:band\s*)?score\s*[:=]?\s*[1-9]\s*(?:(?:\/\s*9)|(?:out\s+of\s+9))?\b/gi, " ")
    .replace(/\bband\s*[1-9]\b/gi, " ")
    .replace(/\b[1-9]\s*(?:\/\s*9|out\s+of\s+9)\b/gi, " ")
    .replace(STATUS_MARKER_GLOBAL_PATTERN, " ")
    .replace(/^[\s:;,()[\]{}—–-]+|[\s:;,()[\]{}—–-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
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
  if (typeof value !== "string") return null;
  const lines = value.trim().split(/\r?\n/);
  if (lines.length < 3 || lines.length > MAX_DIAGNOSTIC_ROWS + 2
    || lines.some((line) => !line.trim())) return null;

  const parseCells = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return null;
    const cells = trimmed.slice(1, -1).split("|").map((cell) => cell.trim());
    return cells.length === 4 ? cells : null;
  };
  const header = parseCells(lines[0]);
  const separator = parseCells(lines[1]);
  if (!header || !header.every((cell, index) => cell === ACADEMIS_DIAGNOSTIC_HEADERS[index])
    || !separator?.every((cell) => /^:?-{3,}:?$/.test(cell))) return null;

  const dataRows = lines.slice(2);
  const rows: AcademisDiagnosticRow[] = [];
  const scores: Array<[string, number | null]> = [];
  const usedIndexes = new Set<string>();
  const usedCriteria = new Set<string>();
  for (const [index, line] of dataRows.entries()) {
    const cells = parseCells(line);
    if (!cells) return null;
    if (cells[1].length > 200
      || !cells[2].trim() || cells[2].length > 300
      || !cells[3].trim() || cells[3].length > 800) return null;
    const marker = cells[1].match(STATUS_MARKER_PATTERN)?.[1];
    const reportedScore = extractBandScore(cells[1]);
    let rowIndex = cells[0].trim() || String(index + 1);
    if (usedIndexes.has(rowIndex)) rowIndex = `${rowIndex}-${index + 1}`;
    usedIndexes.add(rowIndex);
    const criterion = extractCriterionLabel(cells[1]) || `Criterion ${rowIndex}`;
    if (criterion.length > 120) return null;
    let scoreKey = criterion;
    if (usedCriteria.has(scoreKey.toLowerCase())) scoreKey = `${criterion} (${rowIndex})`;
    if (usedCriteria.has(scoreKey.toLowerCase())) return null;
    usedCriteria.add(scoreKey.toLowerCase());
    const indicator = reportedScore === undefined
      ? marker
      : reportedScore >= 6 ? "+" : "-";
    scores.push([scoreKey, reportedScore ?? null]);
    rows.push({
      index: rowIndex,
      status_axis: `${indicator ? `${indicator} ` : ""}${criterion}${reportedScore === undefined ? "" : ` (${reportedScore}/9)`}`,
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
