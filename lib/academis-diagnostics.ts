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

export interface AcademisCriteriaScores {
  task: number;
  coherence: number;
  lexical: number;
  grammar: number;
}

export interface ParsedAcademisDiagnosticTable {
  criteriaScores: AcademisCriteriaScores;
  diagnosticTable: AcademisDiagnosticTable;
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
  if (lines.length !== 6 || lines.some((line) => !line.trim())) return null;

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

  const axes: Array<{ key: keyof AcademisCriteriaScores; label: string }> = [
    { key: "task", label: "Task Achievement & Depth" },
    { key: "coherence", label: "Coherence & Flow" },
    { key: "lexical", label: "Lexical Precision & Range" },
    { key: "grammar", label: "Grammatical Accuracy" },
  ];
  const rows: AcademisDiagnosticRow[] = [];
  const criteriaScores = {} as AcademisCriteriaScores;
  for (const [index, axis] of axes.entries()) {
    const cells = parseCells(lines[index + 2]);
    if (!cells) return null;
    const status = cells[1].match(/^([+-]) (.+) \(([1-9])\/9\)$/);
    if (!status || status[2] !== axis.label) return null;
    const score = Number(status[3]);
    const expectedSign = score >= 6 ? "+" : "-";
    if (cells[0] !== String(index + 1)
      || status[1] !== expectedSign
      || typeof cells[2] !== "string" || !cells[2].trim() || cells[2].length > 300
      || typeof cells[3] !== "string" || !cells[3].trim() || cells[3].length > 800) return null;
    criteriaScores[axis.key] = score;
    rows.push({
      index: cells[0],
      status_axis: cells[1],
      student_feedback: cells[2].trim(),
      instructor_diagnostic: cells[3].trim(),
    });
  }
  return {
    criteriaScores,
    diagnosticTable: {
      rows,
      markdown: formatAcademisDiagnosticTable(rows, true),
    },
  };
}
