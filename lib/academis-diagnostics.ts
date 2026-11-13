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

const SEVERE_CRITIQUE_PATTERN = /\b(?:off[- ]topic|unrelated|unintelligible|mostly inaccurate|missing|miss(?:es|ed) (?:the )?(?:core|main|key|task)|omit(?:s|ted) (?:the )?(?:core|main|key)|failed to (?:answer|address|meet)|fails to (?:answer|address|meet)|does not (?:fully )?(?:answer|address|meet)|doesn't (?:fully )?(?:answer|address|meet)|incorrect|inaccurate)\b|\b(?:major|serious|significant|substantial|frequent|repeated|persistent)\s+(?:\w+\s+){0,2}(?:errors?|mistakes?|gaps?|weakness(?:es)?|issues?|omissions?|inaccuracies|problems?)\b/i;
const MODERATE_CRITIQUE_PATTERN = /\b(?:limited|unclear|inconsistent|incomplete|underdeveloped|insufficient|weak|lacks?|struggles?|difficulty|needs? (?:more|clearer|stronger)|could (?:improve|strengthen|clarify|include|add)|should (?:include|add|clarify)|would benefit from|expand(?:s|ed)? on|improve(?:s|d)?|add(?:ing)? (?:more|a|an|one)|include more|provide more)\b|\b(?:some|several|minor|occasional)\s+(?:\w+\s+){0,2}(?:errors?|mistakes?|gaps?|issues?|weaknesses|omissions?|inaccuracies|details?|examples?|support)\b/i;

function feedbackIdentifiesConcern(text: string, pattern: RegExp) {
  return text.split(/(?<=[.!?])\s+/).some((sentence) => {
    const match = pattern.exec(sentence);
    if (!match) return false;
    const precedingText = sentence.slice(0, match.index);
    return !/\b(?:no|not|without|never)\s+(?:\w+\s+){0,3}$/i.test(precedingText);
  });
}

function calibrateScoreFromFeedback(score: number, feedback: string) {
  if (feedbackIdentifiesConcern(feedback, SEVERE_CRITIQUE_PATTERN)) return Math.min(score, 5);
  if (feedbackIdentifiesConcern(feedback, MODERATE_CRITIQUE_PATTERN)) return Math.min(score, 7);
  return score;
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
    const reportedScore = Number(status[3]);
    const expectedSign = reportedScore >= 6 ? "+" : "-";
    if (cells[0] !== String(index + 1)
      || status[1] !== expectedSign
      || typeof cells[2] !== "string" || !cells[2].trim() || cells[2].length > 300
      || typeof cells[3] !== "string" || !cells[3].trim() || cells[3].length > 800) return null;
    const score = calibrateScoreFromFeedback(reportedScore, `${cells[2]} ${cells[3]}`);
    criteriaScores[axis.key] = score;
    rows.push({
      index: cells[0],
      status_axis: `${score >= 6 ? "+" : "-"} ${axis.label} (${score}/9)`,
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
