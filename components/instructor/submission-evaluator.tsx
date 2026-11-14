"use client";

import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ClipboardCheck, Mic, Pin, Save, Settings2, Sparkles, Star, X } from "lucide-react";
import { LessonEvaluation } from "@/types/lesson";
import { getInstructorSubmissionData, saveInstructorEvaluation } from "@/lib/evaluations";
import { uploadVoiceFeedback } from "@/services/storage-service";
import { CustomAudioPlayer } from "@/components/study-room/custom-audio-player";
import { AudioRecorder } from "@/components/shared/audio-recorder";
import { TiptapEditor } from "@/components/shared/tiptap-editor";
import { type UnifiedReportStage } from "@/components/shared/unified-report-card";
import { combineTaskFeedback } from "@/lib/evaluation-feedback";
import { areAcademisPromptTitlesUnique } from "@/lib/academis-prompts";
import {
  parseMarkdownReportTable,
  replaceAcademisBreakTags,
  type AcademisReportTableContent,
} from "@/lib/academis-report";
import {
  ACADEMIS_DIAGNOSTIC_HEADERS,
  calculateAcademisScoreMean,
  extractAcademisBandScore,
  extractAcademisCriterionLabel,
  formatAcademisDiagnosticTable,
  type AcademisDiagnosticRow,
  type AcademisDiagnosticTable,
} from "@/lib/academis-diagnostics";
import {
  type RubricScale,
  DEFAULT_RUBRIC_SCALE,
  RUBRIC_SCALE_OPTIONS,
  aggregateOverallRubric,
  calculateStageOverallScore,
  convertRubricScore,
  displayRubricScore,
  formatOverallRubricTotal,
  formatRubricScore,
  getRubricScale,
  normalizeRubricScore,
  roundRubricScoreForScale,
} from "@/lib/rubric-scoring";

export type { RubricScale } from "@/lib/rubric-scoring";

export interface FeedbackPayload {
  scores: Record<string, number>;
  totalScore: number;
  comments: string;
  criterionFeedback: Record<string, string>;
  stageFeedback: Record<string, string>;
  stageScores: Record<string, Record<string, number>>;
  stageRubricScales: Record<string, RubricScale>;
  taskScores: Record<string, Record<string, number>>;
  taskRubricScales: Record<string, RubricScale>;
  globalRubricScale: RubricScale;
  reportCardScoreOverrides: Record<string, number>;
  taskFeedback: Record<string, string>;
  inlineCorrections: Record<string, string>;
  stageVoiceFeedback: Record<string, string>;
}

interface SubmissionEvaluatorProps {
  lessonId?: string;
  pendingSubmissionId?: string;
  studentName?: string;
  studentId?: string;
  instructorId?: string;
  onSubmitFeedback?: (data: FeedbackPayload) => void | Promise<void>;
  onSaveDraft?: (data: FeedbackPayload) => void | Promise<void>;
  evaluation?: LessonEvaluation;
  reportCardStages?: UnifiedReportStage[];
  onUpdateEvaluation?: (evaluation: LessonEvaluation) => void;
  usePostgres?: boolean;
}

const RUBRIC_CRITERIA = [
  { id: "task", label: "Task Achievement & Depth", max: 5 },
  { id: "coherence", label: "Coherence & Flow", max: 5 },
  { id: "lexical", label: "Lexical Precision & Range", max: 5 },
  { id: "grammar", label: "Grammatical Accuracy", max: 5 },
];
const STAGE_RUBRIC_CRITERIA = RUBRIC_CRITERIA;
const MAX_INSTRUCTOR_PROMPT_LENGTH = 2500;
const MAX_ACADEMIS_TASK_PROMPT_LENGTH = 6000;
const MAX_ACADEMIS_TASK_TITLE_LENGTH = 300;
const MAX_ACADEMIS_RESPONSE_LENGTH = 12000;
const ACADEMIS_DIAGNOSTIC_PROMPT_GUIDANCE = `Return each grading in exactly one Markdown table with these four columns: ${ACADEMIS_DIAGNOSTIC_HEADERS.join(" | ")}. Include one row per criterion specified by the active prompt without assuming a fixed criterion set, concise actionable student feedback in column 3, and evidence-based instructor / Lesson Builder analysis in column 4.`;
const AUDIO_RESPONSE_PLACEHOLDER = /^audio response submitted(?:; transcript unavailable for grading)?\.?$/i;
const ACADEMIS_PROMPTS = [
  {
    id: "balanced",
    label: "Balanced review",
    prompt: `${ACADEMIS_DIAGNOSTIC_PROMPT_GUIDANCE} Assess each rubric axis from evidence in the response. Be concise, respectful, direct, and practical. Mention strengths only when the response demonstrates them; avoid generic praise and clichés.`,
  },
  {
    id: "language",
    label: "Language focus",
    prompt: `${ACADEMIS_DIAGNOSTIC_PROMPT_GUIDANCE} Prioritize evidence-based feedback on grammatical accuracy, lexical precision, and natural phrasing. Identify the most useful correction without generic praise or clichés.`,
  },
  {
    id: "encouraging",
    label: "Encouraging summary",
    prompt: `${ACADEMIS_DIAGNOSTIC_PROMPT_GUIDANCE} Use a respectful, learner-supportive tone. Identify only genuine, evidence-based strengths and give a direct, practical next step; avoid generic praise and clichés.`,
  },
] as const;
const DEFAULT_ACADEMIS_CATEGORIES = ACADEMIS_PROMPTS.map(({ id, label }) => ({ id, label }));
const ALL_ACADEMIS_PROMPTS_CATEGORY_ID = "__all_academis_prompts__";
interface AcademisPromptPreset {
  id: string;
  label: string;
  prompt: string;
  categoryId: string;
  isFavorite: boolean;
  stageId?: string;
  taskId?: string;
}

interface AcademisPromptCategory {
  id: string;
  label: string;
}

interface AcademisInsight {
  criteria_scores: Record<string, number | null>;
  overall_band_score: number | null;
  student_summary: string;
  diagnostic_table?: AcademisDiagnosticTable;
  instructor_diagnostic: {
    stage_summary_diagnostic?: string;
    key_error_patterns: Array<{
      pattern: string;
      example: string;
      lesson_adjustment: string;
    }>;
    targeted_resources: Array<{
      topic: string;
      title: string;
      reason: string;
    }>;
    teaching_notes: string;
  };
}

type AcademisResultTab = "student-summary" | "instructor-diagnostic";

interface AcademisEvaluationContext {
  taskId: string;
  stageId: string;
  stageTitle: string;
  taskTitle: string;
  taskPrompt: string;
  studentResponse: string;
  studentTranscript?: string;
  transcriptSource?: "student" | "task_answer" | "shadowing_reference";
  referenceTranscript?: string;
  audioResponseSubmitted?: boolean;
  instructorPrompt: string;
}

interface AcademisStoredReport {
  id: string;
  report_data?: Record<string, unknown>;
  published_content: unknown;
  is_published: boolean;
}

interface AcademisTaskResult {
  context: AcademisEvaluationContext;
  result: AcademisInsight;
  stored: boolean;
  report?: AcademisStoredReport;
}

type AcademisPublishedContentDraft =
  | { format: "markdown_table"; headers: string[]; rows: string[][] }
  | { format: "text"; content: string };

const DEFAULT_REPORT_STAGES: UnifiedReportStage[] = [
  { id: "warm_up", title: "Warm-up", tasks: [] },
  { id: "lesson", title: "Lesson", tasks: [] },
  { id: "listening", title: "Listening", tasks: [] },
  { id: "reading", title: "Reading", tasks: [] },
  { id: "writing", title: "Writing", tasks: [] },
  { id: "speaking", title: "Speaking", tasks: [] },
];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function stripMarkdown(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|h[1-6]|li|blockquote|div)>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1$2")
    .replace(/(^|[^_])_([^_\n]+)_(?!_)/g, "$1$2")
    .replace(/[*_~`]/g, "")
    .trim();
}

function getTaskEvaluationText(task: UnifiedReportStage["tasks"][number]) {
  const candidates = [
    { text: task.studentTranscript, source: "student" as const },
    { text: task.studentAnswer, source: "task_answer" as const },
    { text: task.referenceTranscript, source: "shadowing_reference" as const },
  ];
  for (const candidate of candidates) {
    const text = candidate.text?.trim();
    if (text && !AUDIO_RESPONSE_PLACEHOLDER.test(text)) {
      return { text, source: candidate.source };
    }
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeAcademisPromptLibrary(value: unknown) {
  const savedCategories = Array.isArray(value)
    ? DEFAULT_ACADEMIS_CATEGORIES
    : isRecord(value) && Array.isArray(value.categories) ? value.categories : null;
  const savedPresets = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.presets) ? value.presets : null;
  if (!savedCategories
    || !savedCategories.every((category) => isRecord(category)
      && typeof category.id === "string"
      && typeof category.label === "string")
    || !savedPresets
    || !savedPresets.every((preset) => isRecord(preset)
      && typeof preset.id === "string"
      && typeof preset.label === "string"
      && typeof preset.prompt === "string")) {
    throw new Error("Saved Academis prompt library has an invalid format.");
  }

  const categories = savedCategories.map((category) => ({
    id: ((category as Record<string, unknown>).id as string).trim(),
    label: ((category as Record<string, unknown>).label as string).trim(),
  })).filter((category) => category.id.trim() && category.label);
  const categoryIds = new Set(categories.map((category) => category.id));
  const presets: AcademisPromptPreset[] = savedPresets.map((preset) => {
    const item = preset as Record<string, unknown>;
    const categoryId = typeof item.categoryId === "string" && categoryIds.has(item.categoryId)
      ? item.categoryId
      : categoryIds.has(item.id as string) ? item.id as string : categories[0]?.id;
    if (!categoryId) throw new Error("Saved Academis prompts must be assigned to a category.");
    return {
      id: (item.id as string).trim(),
      label: (item.label as string).trim(),
      prompt: (item.prompt as string).trim(),
      categoryId,
      isFavorite: item.isFavorite === true,
      ...(typeof item.stageId === "string" && typeof item.taskId === "string"
        ? { stageId: item.stageId, taskId: item.taskId }
        : {}),
    };
  }).filter((preset) => preset.id && preset.label && preset.prompt);
  return { categories, presets };
}

function isAcademisInsight(value: unknown): value is AcademisInsight {
  if (!isRecord(value)
    || !isRecord(value.criteria_scores)
    || !isRecord(value.instructor_diagnostic)
    || (value.overall_band_score !== null
      && (typeof value.overall_band_score !== "number"
        || !Number.isFinite(value.overall_band_score)
        || value.overall_band_score < 1
        || value.overall_band_score > 9))
    || typeof value.student_summary !== "string"
    || (value.diagnostic_table !== undefined && !isAcademisDiagnosticTable(value.diagnostic_table))
    || !Array.isArray(value.instructor_diagnostic.key_error_patterns)
    || !Array.isArray(value.instructor_diagnostic.targeted_resources)
    || (value.instructor_diagnostic.stage_summary_diagnostic !== undefined
      && typeof value.instructor_diagnostic.stage_summary_diagnostic !== "string")
    || typeof value.instructor_diagnostic.teaching_notes !== "string") {
    return false;
  }
  const criteriaScores = value.criteria_scores;
  const scoreEntries = Object.entries(criteriaScores);
  if (!scoreEntries.every(([criterion, score]) => (
    Boolean(criterion.trim()) && (score === null
      || (typeof score === "number" && Number.isInteger(score) && score >= 1 && score <= 9))
  ))) return false;
  return value.instructor_diagnostic.key_error_patterns.every((pattern) =>
    isRecord(pattern)
      && typeof pattern.pattern === "string"
      && typeof pattern.example === "string"
      && typeof pattern.lesson_adjustment === "string")
    && value.instructor_diagnostic.targeted_resources.every((resource) =>
      isRecord(resource)
        && typeof resource.topic === "string"
        && typeof resource.title === "string"
        && typeof resource.reason === "string");
}

function isAcademisDiagnosticTable(value: unknown): value is AcademisDiagnosticTable {
  if (!isRecord(value) || typeof value.markdown !== "string"
    || !Array.isArray(value.rows) || value.rows.length === 0 || value.rows.length > 40
    || !value.rows.every((row): row is AcademisDiagnosticRow => isRecord(row)
      && typeof row.index === "string"
      && typeof row.status_axis === "string"
      && typeof row.student_feedback === "string"
      && typeof row.instructor_diagnostic === "string")) return false;
  const rows = value.rows as AcademisDiagnosticRow[];
  return new Set(rows.map((row) => row.index)).size === rows.length;
}

function isAcademisStoredReport(value: unknown): value is AcademisStoredReport {
  return isRecord(value)
    && typeof value.id === "string"
    && (value.report_data === undefined || isRecord(value.report_data))
    && typeof value.is_published === "boolean"
    && "published_content" in value;
}

function normalizeAcademisReportTable(value: unknown): Pick<AcademisReportTableContent, "headers" | "rows"> | null {
  if (typeof value === "string") {
    const parsed = parseMarkdownReportTable(value);
    return parsed ? { headers: parsed.headers, rows: parsed.rows } : null;
  }
  if (!isRecord(value)) return null;
  if (value.format === "standard_evaluation_report_v1" && Array.isArray(value.rows)) {
    const rows: string[][] = [];
    for (const row of value.rows) {
      if (!isRecord(row)) return null;
      const cells = [
        row.index,
        row.axis_score,
        row.actionable_feedback,
        row.strengths_weaknesses_diagnostics,
      ];
      if (!cells.every((cell): cell is string => typeof cell === "string")) return null;
      rows.push(cells.map(replaceAcademisBreakTags));
    }
    if (!rows.length) return null;
    return {
      headers: [...ACADEMIS_DIAGNOSTIC_HEADERS],
      rows,
    };
  }
  if ((!Array.isArray(value.headers) || !Array.isArray(value.rows)) && typeof value.markdown === "string") {
    const parsed = parseMarkdownReportTable(value.markdown);
    return parsed ? { headers: parsed.headers, rows: parsed.rows } : null;
  }
  if (!Array.isArray(value.headers) || !Array.isArray(value.rows)) return null;
  const toCell = (cell: unknown) => typeof cell === "string"
    ? replaceAcademisBreakTags(cell)
    : typeof cell === "number" || typeof cell === "boolean" ? String(cell) : "";
  const headers = value.headers.map(toCell);
  if (!headers.length) return null;
  const rows = value.rows
    .filter(Array.isArray)
    .map((row) => {
      const cells = row.map(toCell);
      if (cells.length > headers.length) {
        cells.splice(headers.length - 1, cells.length - headers.length + 1, cells.slice(headers.length - 1).join(" | "));
      }
      return Array.from({ length: headers.length }, (_, index) => cells[index] || "");
    });
  return { headers, rows };
}

function getAcademisPublishedEditorDraft(value: unknown): AcademisPublishedContentDraft {
  const source = typeof value === "string"
    ? value
    : isRecord(value) && typeof value.content === "string"
      ? value.content
      : isRecord(value) && typeof value.markdown === "string"
        ? value.markdown
      : null;
  const table = normalizeAcademisReportTable(value)
    || (source ? parseMarkdownReportTable(source) : null);
  if (table) {
    const headers = table.headers.slice(0, 3);
    return {
      format: "markdown_table",
      headers,
      rows: table.rows.map((row) => row.slice(0, 3)),
    };
  }
  if (source !== null) return { format: "text", content: replaceAcademisBreakTags(source) };
  return { format: "text", content: "" };
}

function getAcademisStoredReportTable(report: AcademisStoredReport | undefined, insight: AcademisInsight) {
  const storedTable = normalizeAcademisReportTable(report?.report_data?.standard_evaluation_report)
    || normalizeAcademisReportTable(report?.report_data?.markdown_table);
  if (storedTable) return storedTable;
  if (!insight.diagnostic_table) return null;
  return {
    headers: [...ACADEMIS_DIAGNOSTIC_HEADERS],
    rows: insight.diagnostic_table.rows.map((row) => [
      row.index,
      row.status_axis,
      row.student_feedback,
      row.instructor_diagnostic,
    ]),
  };
}

function getAcademisInstructorOnlyTable(report: AcademisStoredReport | undefined, insight: AcademisInsight) {
  const storedTable = normalizeAcademisReportTable(report?.report_data?.instructor_only_table);
  if (storedTable) return storedTable;
  const fullTable = normalizeAcademisReportTable(report?.report_data?.markdown_table);
  if (fullTable && fullTable.headers.length > 3) {
    return {
      headers: [fullTable.headers[0], ...fullTable.headers.slice(3)],
      rows: fullTable.rows.map((row) => [row[0] || "", ...row.slice(3)]),
    };
  }
  if (!insight.diagnostic_table) return null;
  return {
    headers: [ACADEMIS_DIAGNOSTIC_HEADERS[0], ACADEMIS_DIAGNOSTIC_HEADERS[3]],
    rows: insight.diagnostic_table.rows.map((row) => [row.index, row.instructor_diagnostic]),
  };
}

function hasPublishableAcademisContent(draft: AcademisPublishedContentDraft) {
  return draft.format === "markdown_table"
    ? draft.headers.length > 0 && draft.rows.length > 0
    : draft.content.trim().length > 0;
}

function getAcademisCriterionScoreEntries(rows: string[][]) {
  const usedKeys = new Set<string>();
  return rows.map((row, index) => {
    const rowIndex = row[0]?.trim() || String(index + 1);
    const axis = replaceAcademisBreakTags(row[1] || "");
    const label = extractAcademisCriterionLabel(axis) || `Criterion ${rowIndex}`;
    let key = label;
    if (usedKeys.has(key.toLocaleLowerCase())) key = `${label} (${rowIndex})`;
    usedKeys.add(key.toLocaleLowerCase());
    return { key, score: extractAcademisBandScore(axis) ?? null };
  });
}

function formatAcademisAxisWithScore(axis: string, score: number | null) {
  const label = extractAcademisCriterionLabel(replaceAcademisBreakTags(axis)) || "Criterion";
  if (score === null) return label;
  return `${score >= 6 ? "+" : "-"} ${label} (${score}/9)`;
}

function formatAcademisPublishedDraft(draft: AcademisPublishedContentDraft) {
  if (draft.format === "text") return draft.content;
  const escapeCell = (value: string) => value.replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>").trim();
  return [
    `| ${draft.headers.map(escapeCell).join(" | ")} |`,
    `| ${draft.headers.map(() => "---").join(" | ")} |`,
    ...draft.rows.map((row) => `| ${draft.headers.map((_, index) => escapeCell(row[index] || "")).join(" | ")} |`),
  ].join("\n");
}

function AcademisDiagnosticTableView({
  rows,
  includeInstructorColumn,
  onStudentFeedbackChange,
}: {
  rows: AcademisDiagnosticRow[];
  includeInstructorColumn: boolean;
  onStudentFeedbackChange?: (index: string, value: string) => void;
}) {
  const headers = ACADEMIS_DIAGNOSTIC_HEADERS.slice(0, includeInstructorColumn ? 4 : 3);
  const widths = includeInstructorColumn
    ? ["3.5rem", "13rem", "24rem", "26rem"]
    : ["3.5rem", "17rem", "39rem"];
  return <div className="w-full overflow-x-auto rounded-lg border border-border">
    <table
        aria-label={includeInstructorColumn ? "Instructor diagnostic table with private analysis" : "Student feedback table"}
        className={`w-full table-fixed text-left text-xs ${includeInstructorColumn ? "min-w-[1064px]" : "min-w-[960px]"}`}
    >
        <colgroup>{headers.map((header, index) => <col key={header} style={{ width: widths[index] }} />)}</colgroup>
        <thead className="bg-background text-[10px] font-semibold text-stone-300">
          <tr>{headers.map((header) => <th key={header} scope="col" className="border-b border-border p-3 align-top">{header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row) => <tr key={row.index} className="align-top even:bg-background/40">
            <td className="border-b border-border p-3 font-mono text-stone-400">{row.index}</td>
            <td className="border-b border-border p-3 font-medium text-stone-200">{replaceAcademisBreakTags(row.status_axis)}</td>
            <td className="border-b border-border p-3 text-stone-300">
              {onStudentFeedbackChange
                ? <textarea
                  value={replaceAcademisBreakTags(row.student_feedback)}
                  maxLength={300}
                  rows={Math.min(8, Math.max(3, row.student_feedback.split(/\r?\n/).length, Math.ceil(row.student_feedback.length / 55)))}
                  onChange={(event) => onStudentFeedbackChange(row.index, event.target.value)}
                  aria-label={`Edit student feedback for ${row.status_axis}`}
                  className="w-full resize-y rounded-md border border-border bg-[#0b0e13] p-2 text-xs leading-relaxed text-stone-100 outline-none focus:border-amber-500/40"
                />
                : <p className="whitespace-pre-wrap break-words leading-relaxed">{replaceAcademisBreakTags(row.student_feedback)}</p>}
            </td>
            {includeInstructorColumn && <td className="border-b border-border p-3 text-stone-400">
              <p className="whitespace-pre-wrap break-words leading-relaxed">{replaceAcademisBreakTags(row.instructor_diagnostic)}</p>
            </td>}
          </tr>)}
        </tbody>
    </table>
  </div>;
}

function AcademisReportTableView({
  headers,
  rows,
  editableColumns = [],
  onCellChange,
  ariaLabel,
}: {
  headers: string[];
  rows: string[][];
  editableColumns?: number[];
  onCellChange?: (rowIndex: number, columnIndex: number, value: string) => void;
  ariaLabel: string;
}) {
  const widths = headers.length >= 4
    ? ["3.5rem", "13rem", "24rem", "26rem", ...headers.slice(4).map(() => "28rem")]
    : headers.length === 3
      ? ["3.5rem", "17rem", "39rem"]
      : headers.length === 2
        ? ["3.5rem", "42rem"]
        : headers.map(() => "20rem");
  const minWidthClass = headers.length >= 4
    ? "min-w-[1064px]"
    : headers.length === 3
      ? "min-w-[960px]"
      : headers.length === 2
        ? "min-w-[720px]"
        : "min-w-[320px]";
  return <div className="w-full overflow-x-auto rounded-lg border border-border">
    <table aria-label={ariaLabel} className={`w-full ${minWidthClass} table-fixed text-left text-xs`}>
      <colgroup>{headers.map((header, index) => <col key={`${header}-${index}`} style={{ width: widths[index] }} />)}</colgroup>
      <thead className="bg-background text-[10px] font-semibold text-stone-300">
        <tr>{headers.map((header, index) => <th key={`${header}-${index}`} scope="col" className="border-b border-border p-3 align-top">{replaceAcademisBreakTags(header)}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => <tr key={`${row[0] || "row"}-${rowIndex}`} className="align-top even:bg-background/40">
          {headers.map((_, columnIndex) => <td key={columnIndex} className="border-b border-border p-3 text-stone-300">
            {editableColumns.includes(columnIndex) && onCellChange
              ? <textarea
                value={replaceAcademisBreakTags(row[columnIndex] || "")}
                rows={Math.min(10, Math.max(
                  columnIndex === 1 ? 2 : 3,
                  replaceAcademisBreakTags(row[columnIndex] || "").split(/\r?\n/).length,
                  Math.ceil(replaceAcademisBreakTags(row[columnIndex] || "").length / (columnIndex === 1 ? 38 : 58)),
                ))}
                onChange={(event) => onCellChange(rowIndex, columnIndex, event.target.value)}
                aria-label={`Edit ${headers[columnIndex]} for row ${row[0] || rowIndex + 1}`}
                className="w-full resize-y rounded-md border border-border bg-[#0b0e13] p-2 text-xs leading-relaxed text-stone-100 outline-none focus:border-amber-500/40"
              />
              : <p className="whitespace-pre-wrap break-words leading-relaxed">{replaceAcademisBreakTags(row[columnIndex] || "")}</p>}
          </td>)}
        </tr>)}
      </tbody>
    </table>
  </div>;
}

function normalizeAnswer(value: string) {
  return value.trim().toLowerCase().replace(/^[a-z]\s*[).]\s*/, "").trim();
}

export function SubmissionEvaluator({
  lessonId,
  pendingSubmissionId,
  studentName = "Student",
  studentId,
  instructorId,
  onSubmitFeedback,
  onSaveDraft,
  evaluation,
  reportCardStages = [],
  onUpdateEvaluation,
  usePostgres = true,
}: SubmissionEvaluatorProps) {
  const comments = evaluation?.comments || "";
  const criterionFeedback = evaluation?.criterionFeedback || {};
  const stageFeedback = evaluation?.stageFeedback || {};
  const stageScores = evaluation?.stageScores || {};
  const stageRubricScales = evaluation?.stageRubricScales || {};
  const taskScores = evaluation?.taskScores || {};
  const taskRubricScales = evaluation?.taskRubricScales || {};
  const globalRubricScale = evaluation?.globalRubricScale || DEFAULT_RUBRIC_SCALE;
  const reportCardScoreOverrides = evaluation?.reportCardScoreOverrides || {};
  const overallAggregation = aggregateOverallRubric({
    criterionIds: RUBRIC_CRITERIA.map(({ id }) => id),
    stageScores,
    stageRubricScales,
    reportCardScoreOverrides,
    fallbackScores: evaluation?.scores,
  });
  const overallScaleId = overallAggregation.scaleId;
  const overallScale = getRubricScale(overallScaleId);
  const stageAverages = Object.fromEntries(RUBRIC_CRITERIA.map(({ id }) => {
    const values = Object.entries(stageScores)
      .map(([stageId, stage]) => {
        const score = stage[id];
        return typeof score === "number" ? normalizeRubricScore(score, stageRubricScales[stageId]) : undefined;
      })
      .filter((score): score is number => typeof score === "number" && Number.isFinite(score));
    return [id, values.length ? values.reduce((sum, score) => sum + score, 0) / values.length : undefined];
  }));
  const scores = overallAggregation.criterionScores;
  const displayScores = overallAggregation.displayCriterionScores;
  const taskFeedback = evaluation?.taskFeedback || {};
  const inlineCorrections = evaluation?.inlineCorrections || {};
  const stageVoiceFeedback = evaluation?.stageVoiceFeedback || {};
  const stages = reportCardStages.length ? reportCardStages : DEFAULT_REPORT_STAGES;
  const initialStage = stages.find((stage) => stage.tasks.length > 0) || stages[0];
  const [activeStageId, setActiveStageId] = useState(initialStage?.id || "report-card");
  const [activeTaskId, setActiveTaskId] = useState(initialStage?.tasks[0]?.id || "");
  const hasManuallySelectedStageRef = useRef(false);
  const [expandedTaskFeedback, setExpandedTaskFeedback] = useState<Record<string, boolean>>({});
  const [isEvaluationSidebarCollapsed, setIsEvaluationSidebarCollapsed] = useState(false);
  const [isAcademisSidebarCollapsed, setIsAcademisSidebarCollapsed] = useState(false);
  const [academisPrompt, setAcademisPromptState] = useState<string>(ACADEMIS_PROMPTS[0].prompt);
  const academisPromptRef = useRef<string>(ACADEMIS_PROMPTS[0].prompt);
  const setAcademisPrompt = (prompt: string) => {
    academisPromptRef.current = prompt;
    setAcademisPromptState(prompt);
  };
  const [academisPresets, setAcademisPresets] = useState<AcademisPromptPreset[]>(
    ACADEMIS_PROMPTS.map((preset) => ({
      ...preset,
      categoryId: preset.id,
      isFavorite: false,
    })),
  );
  const [academisCategories, setAcademisCategories] = useState<AcademisPromptCategory[]>(DEFAULT_ACADEMIS_CATEGORIES);
  const [academisPresetDrafts, setAcademisPresetDrafts] = useState<AcademisPromptPreset[]>([]);
  const [academisCategoryDrafts, setAcademisCategoryDrafts] = useState<AcademisPromptCategory[]>([]);
  const [activeAcademisCategoryId, setActiveAcademisCategoryId] = useState<string>(ACADEMIS_PROMPTS[0].id);
  const [isAcademisLibraryOpen, setIsAcademisLibraryOpen] = useState(false);
  const [isAcademisLibraryLoading, setIsAcademisLibraryLoading] = useState(true);
  const [isSavingAcademisLibrary, setIsSavingAcademisLibrary] = useState(false);
  const [deletingAcademisPresetId, setDeletingAcademisPresetId] = useState<string | null>(null);
  const [academisLibraryError, setAcademisLibraryError] = useState<string | null>(null);
  const [activeAcademisPresetId, setActiveAcademisPresetId] = useState<string>(ACADEMIS_PROMPTS[0].id);
  const [academisInsight, setAcademisInsight] = useState<AcademisTaskResult | null>(null);
  const [academisResultsByTask, setAcademisResultsByTask] = useState<Record<string, AcademisTaskResult>>({});
  const [academisLoadedStages, setAcademisLoadedStages] = useState<Record<string, boolean>>({});
  const [academisRequestContext, setAcademisRequestContext] = useState<AcademisEvaluationContext | null>(null);
  const [isAcademisResultOpen, setIsAcademisResultOpen] = useState(false);
  const [academisResultTab, setAcademisResultTab] = useState<AcademisResultTab>("student-summary");
  const [academisStudentSummary, setAcademisStudentSummary] = useState("");
  const [academisApplyNotice, setAcademisApplyNotice] = useState<string | null>(null);
  const [academisPublishedContentDraft, setAcademisPublishedContentDraft] = useState<AcademisPublishedContentDraft>({
    format: "text",
    content: "",
  });
  const [isPublishingAcademisReport, setIsPublishingAcademisReport] = useState(false);
  const [academisPublishError, setAcademisPublishError] = useState<string | null>(null);
  const [academisPublishNotice, setAcademisPublishNotice] = useState<string | null>(null);
  const [isAcademisLoading, setIsAcademisLoading] = useState(false);
  const [academisError, setAcademisError] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isSavingDraft, setIsSavingDraft] = useState<boolean>(false);
  const [draftStatus, setDraftStatus] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [publishNotice, setPublishNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [voiceUploadStage, setVoiceUploadStage] = useState<string | null>(null);
  const [voiceUploadError, setVoiceUploadError] = useState<string | null>(null);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [submissionLoadState, setSubmissionLoadState] = useState<
    "idle" | "loading" | "loaded" | "missing"
  >(usePostgres ? "idle" : "loaded");

  useEffect(() => {
    if (activeStageId === "report-card") return;
    const stage = stages.find((item) => item.id === activeStageId);
    if (!stage) {
      const primaryStage = stages[0];
      if (primaryStage) {
        setActiveStageId(primaryStage.id);
        setActiveTaskId(primaryStage.tasks[0]?.id || "");
      }
      return;
    }
    if (!stage.tasks.some((task) => task.id === activeTaskId)) {
      setActiveTaskId(stage.tasks[0]?.id || "");
    }
  }, [stages, activeStageId, activeTaskId]);

  useEffect(() => {
    const loadPromptLibrary = async () => {
      try {
        const response = await fetch("/api/instructor/academis-prompts", { credentials: "same-origin" });
        const payload: unknown = await response.json();
        if (!response.ok) {
          throw new Error(isRecord(payload) && typeof payload.error === "string"
            ? payload.error
            : "Unable to load the Academis prompt library.");
        }
        if (!isRecord(payload)) throw new Error("The Academis prompt library response is invalid.");

        let library: ReturnType<typeof normalizeAcademisPromptLibrary>;
        if (payload.library !== null && payload.library !== undefined) {
          library = normalizeAcademisPromptLibrary(payload.library);
        } else {
          const legacyValue = window.localStorage.getItem(`fluentia:academis-presets:${instructorId || "default"}`);
          library = legacyValue
            ? normalizeAcademisPromptLibrary(JSON.parse(legacyValue) as unknown)
            : {
              categories: DEFAULT_ACADEMIS_CATEGORIES,
              presets: ACADEMIS_PROMPTS.map((preset) => ({
                ...preset,
                categoryId: preset.id,
                isFavorite: false,
              })),
            };
          const saveResponse = await fetch("/api/instructor/academis-prompts", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify(library),
          });
          const savedPayload: unknown = await saveResponse.json();
          if (!saveResponse.ok) {
            throw new Error(isRecord(savedPayload) && typeof savedPayload.error === "string"
              ? savedPayload.error
              : "Unable to migrate the Academis prompt library.");
          }
          if (!isRecord(savedPayload)) throw new Error("The saved Academis prompt library response is invalid.");
          library = normalizeAcademisPromptLibrary(savedPayload.library);
        }

        setAcademisCategories(library.categories);
        setAcademisPresets(library.presets);
        const taskPreset = library.presets.find((preset) => (
          preset.stageId === activeStageId && preset.taskId === activeTaskId
        ));
        const selected = taskPreset || library.presets.find((preset) => preset.isFavorite) || library.presets[0];
        if (selected) {
          setActiveAcademisCategoryId(selected.categoryId);
          setActiveAcademisPresetId(selected.id);
          setAcademisPrompt(selected.prompt);
        } else {
          setActiveAcademisCategoryId(library.categories[0]?.id || ALL_ACADEMIS_PROMPTS_CATEGORY_ID);
          setActiveAcademisPresetId("");
          setAcademisPrompt("");
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to load saved Academis prompts.";
        setAcademisError(message);
        setAcademisLibraryError(message);
        console.error("Academis prompt library could not be loaded:", error);
      } finally {
        setIsAcademisLibraryLoading(false);
      }
    };
    void loadPromptLibrary();
  }, [instructorId]);

  useEffect(() => {
    if (!isAcademisLibraryOpen && !isAcademisResultOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (!isSavingAcademisLibrary && !deletingAcademisPresetId) setIsAcademisLibraryOpen(false);
        if (!isAcademisLoading) setIsAcademisResultOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isAcademisLibraryOpen, isAcademisResultOpen, isSavingAcademisLibrary, deletingAcademisPresetId, isAcademisLoading]);

  useEffect(() => {
    if (!academisApplyNotice) return;
    const timeoutId = window.setTimeout(() => setAcademisApplyNotice(null), 3200);
    return () => window.clearTimeout(timeoutId);
  }, [academisApplyNotice]);

  // Load the instructor's submission and saved evaluation through the authenticated API.
  useEffect(() => {
    if (usePostgres && lessonId?.trim() && studentId?.trim()) {
      loadSubmissionData();
    }
  }, [lessonId, studentId, pendingSubmissionId, usePostgres]);

  const loadSubmissionData = async () => {
    const normalizedLessonId = lessonId?.trim() || "";
    const normalizedStudentId = studentId?.trim() || "";
    setSubmitError(null);
    if (!UUID_PATTERN.test(normalizedLessonId)
      || !UUID_PATTERN.test(normalizedStudentId)
      || (pendingSubmissionId !== undefined && !UUID_PATTERN.test(pendingSubmissionId))) {
      setSubmissionId(null);
      setSubmissionLoadState("missing");
      return;
    }
    setSubmissionId(null);
    setSubmissionLoadState("loading");
    try {
      const result = await getInstructorSubmissionData(
        normalizedLessonId,
        normalizedStudentId,
        pendingSubmissionId,
      );
      const submission = result.submission;
      if (submission) {
        setSubmissionId(submission.id);
        setSubmissionLoadState("loaded");
      } else {
        setSubmissionId(null);
        setSubmissionLoadState("missing");
      }
      const feedback = result.publishedFeedback;
      if (result.draftEvaluation) {
        onUpdateEvaluation?.({ ...result.draftEvaluation, published: false });
      } else if (feedback) {
        const rubricScores = feedback.rubric_scores || feedback.scores || feedback.criterion_feedback?.scores || {};
        onUpdateEvaluation?.({
          scores: rubricScores,
          totalScore: Number(feedback.total_score ?? feedback.score ?? Object.values(rubricScores).reduce<number>((total, score) => total + Number(score), 0)),
          comments: typeof feedback.criterion_feedback?.overallComments === "string"
            ? feedback.criterion_feedback.overallComments
            : feedback.comments || "",
          criterionFeedback: feedback.criterion_feedback?.comments || feedback.criterion_feedback || evaluation?.criterionFeedback || {},
          stageFeedback: feedback.criterion_feedback?.stages || evaluation?.stageFeedback || {},
          stageScores: feedback.criterion_feedback?.stageScores || evaluation?.stageScores || {},
          stageRubricScales: feedback.criterion_feedback?.stageRubricScales || evaluation?.stageRubricScales || {},
          taskScores: feedback.criterion_feedback?.taskScores || evaluation?.taskScores || {},
          taskRubricScales: feedback.criterion_feedback?.taskRubricScales || evaluation?.taskRubricScales || {},
          globalRubricScale: feedback.criterion_feedback?.globalRubricScale || evaluation?.globalRubricScale || DEFAULT_RUBRIC_SCALE,
          reportCardScoreOverrides: feedback.criterion_feedback?.reportCardScoreOverrides || evaluation?.reportCardScoreOverrides || {},
          taskFeedback: feedback.criterion_feedback?.taskFeedback || evaluation?.taskFeedback || {},
          inlineCorrections: feedback.criterion_feedback?.inlineCorrections || evaluation?.inlineCorrections || {},
          stageVoiceFeedback: feedback.criterion_feedback?.stageVoiceFeedback || evaluation?.stageVoiceFeedback || {},
          strengths: feedback.strengths || undefined,
          areasToImprove: feedback.areas_to_improve || undefined,
          studyHubPrescription: feedback.study_hub_prescription || undefined,
          voiceFeedbackUrl: feedback.voice_feedback_url || undefined,
          published: Boolean(feedback.is_published),
        });
      }
    } catch (error) {
      setSubmissionId(null);
      setSubmissionLoadState("missing");
      const message = error instanceof Error ? error.message : "Unable to load this submission.";
      setSubmitError(message);
      console.error("Student submission could not be refreshed:", error);
    }
  };

  const handleScoreChange = (id: string, val: number) => {
    const normalizedScore = normalizeRubricScore(val, overallScaleId);
    updateEvaluation({
      scores: { ...scores, [id]: normalizedScore },
      reportCardScoreOverrides: { ...reportCardScoreOverrides, [id]: normalizedScore },
    });
  };

  const handleGlobalScaleChange = (nextScale: RubricScale) => {
    const nextStageRubricScales = { ...stageRubricScales };
    const nextStageScores = { ...stageScores };
    const nextTaskRubricScales = { ...taskRubricScales };
    const nextTaskScores = { ...taskScores };
    for (const stage of stages) {
      const currentScale = stageRubricScales[stage.id] || globalRubricScale;
      nextStageRubricScales[stage.id] = nextScale;
      nextStageScores[stage.id] = Object.fromEntries(
        Object.entries(stageScores[stage.id] || {}).map(([criterionId, score]) => [
          criterionId,
          convertRubricScore(score, currentScale, nextScale),
        ]),
      );
      for (const task of stage.tasks) {
        if (!nextTaskScores[task.id]) continue;
        const taskScale = taskRubricScales[task.id] || currentScale;
        nextTaskScores[task.id] = Object.fromEntries(
          Object.entries(taskScores[task.id]).map(([criterionId, score]) => [
            criterionId,
            convertRubricScore(score, taskScale, nextScale),
          ]),
        );
        nextTaskRubricScales[task.id] = nextScale;
      }
    }
    updateEvaluation({
      globalRubricScale: nextScale,
      stageRubricScales: nextStageRubricScales,
      stageScores: nextStageScores,
      taskScores: nextTaskScores,
      taskRubricScales: nextTaskRubricScales,
    });
  };

  const updateEvaluation = (changes: Partial<LessonEvaluation>) => {
    onUpdateEvaluation?.({
      ...evaluation,
      scores,
      comments,
      criterionFeedback,
      stageFeedback,
      stageScores,
      stageRubricScales,
      taskScores,
      taskRubricScales,
      globalRubricScale,
      reportCardScoreOverrides,
      taskFeedback,
      inlineCorrections,
      stageVoiceFeedback,
      ...changes,
    });
    setIsSubmitted(false);
    setDraftStatus(null);
  };

  const totalScore = overallAggregation.totalScore;
  const reportStageId = "report-card";
  const reportStageIndex = stages.length;
  const activeStageIndex = activeStageId === reportStageId
    ? reportStageIndex
    : Math.max(0, stages.findIndex((stage) => stage.id === activeStageId));
  const activeStage = stages[activeStageIndex];
  const activeStageTitle = activeStage ? activeStage.title : "Report Card";
  const activeTask = activeStage?.tasks.find((task) => task.id === activeTaskId) || activeStage?.tasks[0];
  const activeTaskEvaluationText = activeTask ? getTaskEvaluationText(activeTask) : undefined;
  const activeStageTaskSignature = activeStage?.tasks.map((task) => task.id).join("|") || "";
  const activeAcademisCacheKey = submissionId && activeStage && activeTask
    ? JSON.stringify([submissionId, activeStage.id, activeTask.id])
    : null;
  const cachedAcademisResult = activeAcademisCacheKey
    ? academisResultsByTask[activeAcademisCacheKey]
    : undefined;
  const activeInstructorPrompt = academisPromptRef.current.slice(0, MAX_INSTRUCTOR_PROMPT_LENGTH);
  const hasMatchingCachedAcademisResult = Boolean(cachedAcademisResult
    && cachedAcademisResult.context.instructorPrompt === activeInstructorPrompt);
  const activeTaskPrompt = activeTask?.prompt?.trim()
    || activeTask?.title?.trim()
    || activeStage?.prompt?.trim()
    || "";
  const activeStageSummary = submissionId && activeStage
    ? Object.entries(academisResultsByTask)
      .filter(([cacheKey, report]) => cacheKey.startsWith(`${JSON.stringify([submissionId]).slice(0, -1)},`)
        && report.context.stageId === activeStage.id)
      .map(([, report]) => report.result.instructor_diagnostic.stage_summary_diagnostic)
      .filter(Boolean)
      .at(-1)
    : undefined;

  useEffect(() => {
    if (!submissionId || !activeStage || !activeStage.tasks.length) return;
    const stageCacheKey = JSON.stringify([submissionId, activeStage.id]);
    if (academisLoadedStages[stageCacheKey]) return;
    const controller = new AbortController();
    const loadStageReports = async () => {
      try {
        const params = new URLSearchParams({ submissionId, stageId: activeStage.id });
        const response = await fetch(`/api/instructor/academis?${params}`, {
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Unable to load saved Academis reports.");
        const payload: { insights?: unknown } = await response.json();
        const restoredResults: Record<string, AcademisTaskResult> = {};
        if (Array.isArray(payload.insights)) {
          for (const savedReport of payload.insights) {
            if (!isRecord(savedReport)
              || typeof savedReport.taskId !== "string"
              || !isAcademisInsight(savedReport.insight)) continue;
            const task = activeStage.tasks.find((candidate) => candidate.id === savedReport.taskId);
            if (!task) continue;
            const taskPrompt = task.prompt?.trim() || task.title?.trim() || activeStage.prompt?.trim() || "";
            const evaluationText = getTaskEvaluationText(task);
            const context: AcademisEvaluationContext = {
              taskId: task.id,
              stageId: activeStage.id,
              stageTitle: activeStage.title,
              taskTitle: (task.title?.trim() || taskPrompt).slice(0, MAX_ACADEMIS_TASK_TITLE_LENGTH),
              taskPrompt: taskPrompt.slice(0, MAX_ACADEMIS_TASK_PROMPT_LENGTH),
              studentResponse: (evaluationText?.text.trim()
                || (task.audioUrls?.length
                  ? "Audio response submitted; transcript unavailable for grading."
                  : "No written response submitted.")).slice(0, MAX_ACADEMIS_RESPONSE_LENGTH),
              studentTranscript: evaluationText?.text.trim() || undefined,
              transcriptSource: evaluationText?.source,
              referenceTranscript: task.referenceTranscript?.trim() || undefined,
              audioResponseSubmitted: Boolean(task.audioUrls?.length),
              instructorPrompt: "",
            };
            const cacheKey = JSON.stringify([submissionId, activeStage.id, task.id]);
            restoredResults[cacheKey] = {
              context,
              result: savedReport.insight,
              stored: true,
              ...(isAcademisStoredReport(savedReport.report) ? { report: savedReport.report } : {}),
            };
          }
        }
        setAcademisResultsByTask((current) => {
          const next = { ...current };
          for (const [cacheKey, result] of Object.entries(restoredResults)) {
            if (!next[cacheKey]) next[cacheKey] = result;
          }
          return next;
        });
      } catch (error) {
        if (!controller.signal.aborted) {
          console.warn("Saved Academis reports are unavailable; session results remain available:", error);
        }
      } finally {
        if (!controller.signal.aborted) {
          setAcademisLoadedStages((loaded) => ({ ...loaded, [stageCacheKey]: true }));
        }
      }
    };
    void loadStageReports();
    return () => controller.abort();
  }, [submissionId, activeStageId, activeStageTaskSignature, academisLoadedStages]);
  const activeAcademisPreset = academisPresets.find((preset) => preset.id === activeAcademisPresetId);
  const activateAcademisPreset = (preset: AcademisPromptPreset) => {
    setActiveAcademisPresetId(preset.id);
    setActiveAcademisCategoryId(preset.categoryId);
    setAcademisPrompt(preset.prompt);
  };
  const promptAssignmentOptions = stages.flatMap((stage) => stage.tasks
    .filter((task) => Boolean(task.id))
    .map((task, index) => ({
    stageId: stage.id,
    taskId: task.id,
    value: JSON.stringify([stage.id, task.id]),
    label: `${stage.title} · ${stripMarkdown(task.title || task.prompt || `Task ${index + 1}`).replace(/\s+/g, " ").trim()}`,
    })));
  const applyAcademisTaskPrompt = (stageId: string, taskId: string, presets = academisPresets) => {
    const preset = presets.find((item) => item.stageId === stageId && item.taskId === taskId)
      || presets.find((item) => item.isFavorite)
      || presets[0];
    if (!preset) return;
    activateAcademisPreset(preset);
  };
  useEffect(() => {
    if (hasManuallySelectedStageRef.current || activeStageId === reportStageId) return;
    const currentStage = stages.find((stage) => stage.id === activeStageId);
    if (currentStage?.tasks.length) return;
    const firstTaskStage = stages.find((stage) => stage.tasks.length > 0);
    const firstTask = firstTaskStage?.tasks[0];
    if (!firstTaskStage || !firstTask) return;
    setActiveStageId(firstTaskStage.id);
    setActiveTaskId(firstTask.id);
    applyAcademisTaskPrompt(firstTaskStage.id, firstTask.id);
  }, [stages, activeStageId, academisPresets]);
  const evaluationStatus = (stageId: string) => {
    if (evaluation?.published) return "Evaluated";
    const stage = stages.find((item) => item.id === stageId);
    if (stageFeedback[stageId]?.trim()
      || stageVoiceFeedback[stageId]
      || Object.values(stageScores[stageId] || {}).some((score) => score > 0)
      || stage?.tasks.some((task) => taskFeedback[task.id]?.trim() || inlineCorrections[task.id]?.trim())) return "In progress";
    return "Pending Review";
  };
  const payload: FeedbackPayload = {
    scores,
    totalScore,
    comments,
    criterionFeedback,
    stageFeedback,
    stageScores,
    stageRubricScales,
    taskScores,
    taskRubricScales,
    globalRubricScale,
    reportCardScoreOverrides,
    taskFeedback,
    inlineCorrections,
    stageVoiceFeedback,
  };

  const handleSaveDraft = async () => {
    setIsSavingDraft(true);
    setSubmitError(null);
    setDraftStatus(null);
    try {
      if (onSaveDraft) {
        await onSaveDraft(payload);
      } else if (usePostgres && lessonId && studentId && submissionId) {
        await saveInstructorEvaluation(
          submissionId,
          { ...evaluation, ...payload, published: false } as LessonEvaluation,
          false,
        );
      } else {
        throw new Error("Draft saving is unavailable for this evaluation.");
      }
      setDraftStatus("Draft saved. It has not been sent to the student.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save the evaluation draft.";
      setSubmitError(message);
      console.error("Error saving evaluation draft:", error);
    } finally {
      setIsSavingDraft(false);
    }
  };

  const uploadStageVoiceNote = async (stageId: string, audio: Blob) => {
    setVoiceUploadStage(stageId);
    setVoiceUploadError(null);
    try {
      const extension = audio.type.includes("mp4") ? "mp4" : audio.type.includes("ogg") ? "ogg" : "webm";
      const asset = await uploadVoiceFeedback(audio, `${studentId || "student"}-${stageId}-${Date.now()}.${extension}`);
      updateEvaluation({ stageVoiceFeedback: { ...stageVoiceFeedback, [stageId]: asset.url } });
    } catch (error) {
      setVoiceUploadError(error instanceof Error ? error.message : "Unable to upload the voice note.");
      console.error("Evaluation voice note upload failed:", error);
    } finally {
      setVoiceUploadStage(null);
    }
  };

  const handleSubmit = async () => {
    setPublishNotice(null);
    setSubmitError(null);
    if (!onSubmitFeedback && (!usePostgres || !lessonId || !studentId || !submissionId)) {
      const message = "Missing required data for submission";
      setSubmitError(message);
      setPublishNotice({ type: "error", message });
      return;
    }

    setIsSubmitting(true);
    try {
      const publishedEvaluation: LessonEvaluation = {
        ...evaluation,
        scores,
        totalScore,
        comments,
        criterionFeedback,
        stageFeedback,
        stageScores,
        stageRubricScales,
        taskScores,
        taskRubricScales,
        globalRubricScale,
        reportCardScoreOverrides,
        taskFeedback,
        inlineCorrections,
        stageVoiceFeedback,
        published: true,
      };
      if (onSubmitFeedback) {
        await onSubmitFeedback({ ...payload, totalScore });
      } else {
        await saveInstructorEvaluation(submissionId!, publishedEvaluation, true);
      }

      setIsSubmitted(true);
      onUpdateEvaluation?.(publishedEvaluation);
      setPublishNotice({ type: "success", message: "Evaluation successfully published and sent to the student." });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to submit evaluation";
      setSubmitError(errorMessage);
      setPublishNotice({ type: "error", message: errorMessage });
      console.error("Error submitting evaluation:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const changeActiveStage = (stageId: string) => {
    hasManuallySelectedStageRef.current = true;
    const selectedStage = stages.find((stage) => stage.id === stageId);
    const firstTaskId = selectedStage?.tasks[0]?.id || "";
    setActiveStageId(stageId);
    setActiveTaskId(firstTaskId);
    if (selectedStage && firstTaskId) applyAcademisTaskPrompt(stageId, firstTaskId);
    setAcademisInsight(null);
    setAcademisError(null);
    setVoiceUploadError(null);
  };
  const stageStatusClass = (status: string) => status === "Evaluated"
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
    : status === "In progress"
      ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
      : "border-border bg-surface text-stone-500";
  const feedbackError = submitError || (usePostgres && submissionLoadState === "missing" ? "Student has not submitted work for this lesson yet." : null);
  const stageStepper = <div className="w-full min-w-0 overflow-x-auto border-b border-border">
    <nav className="flex w-full min-w-0 justify-between gap-0 px-0" aria-label="Evaluation stages">
      {stages.map((stage, index) => <button
        key={stage.id}
        type="button"
        onClick={() => changeActiveStage(stage.id)}
        aria-current={activeStageId === stage.id ? "step" : undefined}
        className={`shrink-0 whitespace-nowrap border-b-2 px-0 py-3 text-left text-xs transition ${activeStageId === stage.id ? "border-amber-400 text-amber-300" : "border-transparent text-stone-500 hover:text-stone-200"}`}
      >
        <span className="mr-1.5 font-mono text-[10px] text-stone-600">{String(index + 1).padStart(2, "0")}</span>{stage.title}
      </button>)}
      <button
        type="button"
        onClick={() => changeActiveStage(reportStageId)}
        aria-current={activeStageId === reportStageId ? "step" : undefined}
        className={`shrink-0 whitespace-nowrap border-b-2 px-0 py-3 text-left text-xs transition ${activeStageId === reportStageId ? "border-amber-400 text-amber-300" : "border-transparent text-stone-500 hover:text-stone-200"}`}
      >
        <span className="mr-1.5 font-mono text-[10px] text-stone-600">07</span>Report Card
      </button>
    </nav>
  </div>;
  const stageHeading = <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-amber-400">{activeStageId === reportStageId ? "Final review" : `Stage ${String(activeStageIndex + 1).padStart(2, "0")} of 07`}</p>
      <h2 className="mt-1 text-xl font-semibold text-stone-100">{activeStageTitle}</h2>
    </div>
    {activeStageId !== reportStageId && activeStage && <span className={`rounded-full border px-2.5 py-1 text-[10px] ${stageStatusClass(evaluationStatus(activeStage.id))}`}>{evaluationStatus(activeStage.id)}</span>}
  </header>;
  const generateAcademisInsight = async (forceRefresh = false) => {
    const selectedStage = stages.find((stage) => stage.id === activeStageId);
    const selectedTask = selectedStage?.tasks.find((task) => task.id === activeTaskId)
      || selectedStage?.tasks[0];
    const taskPrompt = selectedTask?.prompt?.trim()
      || selectedTask?.title?.trim()
      || selectedStage?.prompt?.trim()
      || "";
    if (!submissionId || !UUID_PATTERN.test(submissionId)) {
      setAcademisError("Wait for the student submission to finish loading, then try again.");
      return;
    }
    if (!selectedStage || !/^[a-z0-9_-]{1,80}$/i.test(selectedStage.id)) {
      setAcademisError("Select a valid evaluation stage before running Academis.");
      return;
    }
    if (!selectedTask || !selectedTask.id || selectedTask.id.length > 200) {
      setAcademisError("Select a task from the current stage before running Academis.");
      return;
    }
    if (!taskPrompt) {
      setAcademisError("The selected task has no prompt for Academis to evaluate.");
      return;
    }
    const evaluationText = getTaskEvaluationText(selectedTask);
    const studentTranscript = evaluationText?.text.trim() || "";
    const studentResponse = studentTranscript
      || (selectedTask.audioUrls?.length
        ? "Audio response submitted; transcript unavailable for grading."
        : "No written response submitted.");
    const requestTaskTitle = (selectedTask.title?.trim() || taskPrompt)
      .slice(0, MAX_ACADEMIS_TASK_TITLE_LENGTH);
    const requestTaskPrompt = taskPrompt.slice(0, MAX_ACADEMIS_TASK_PROMPT_LENGTH);
    const requestStudentResponse = studentResponse.slice(0, MAX_ACADEMIS_RESPONSE_LENGTH);
    const stageTaskContexts = selectedStage.tasks.slice(0, 8).map((task) => {
      const peerEvaluationText = getTaskEvaluationText(task);
      return {
        task_id: task.id,
        task_title: (task.title?.trim() || task.prompt?.trim() || "Untitled task").slice(0, MAX_ACADEMIS_TASK_TITLE_LENGTH),
        task_prompt: (task.prompt?.trim() || task.title?.trim() || "No task prompt provided.").slice(0, 1200),
        student_response: (peerEvaluationText?.text.trim()
          || (task.audioUrls?.length ? "Audio response submitted; transcript unavailable for grading." : "No written response submitted."))
          .slice(0, 2000),
      };
    });
    const evaluationContext: AcademisEvaluationContext = {
      taskId: selectedTask.id,
      stageId: selectedStage.id,
      stageTitle: selectedStage.title.slice(0, 120),
      taskTitle: requestTaskTitle,
      taskPrompt: requestTaskPrompt,
      studentResponse: requestStudentResponse,
      studentTranscript: studentTranscript.slice(0, MAX_ACADEMIS_RESPONSE_LENGTH) || undefined,
      transcriptSource: evaluationText?.source,
      referenceTranscript: selectedTask.referenceTranscript?.trim().slice(0, MAX_ACADEMIS_TASK_PROMPT_LENGTH) || undefined,
      audioResponseSubmitted: Boolean(selectedTask.audioUrls?.length),
      instructorPrompt: academisPromptRef.current.slice(0, MAX_INSTRUCTOR_PROMPT_LENGTH),
    };
    const cacheKey = JSON.stringify([submissionId, selectedStage.id, selectedTask.id]);
    const cachedResult = academisResultsByTask[cacheKey];
    if (cachedResult && !forceRefresh) {
      setAcademisInsight(cachedResult);
      setAcademisRequestContext(cachedResult.context);
      setAcademisStudentSummary(cachedResult.result.student_summary);
      setAcademisPublishedContentDraft(cachedResult.report
        ? getAcademisPublishedEditorDraft(cachedResult.report.published_content)
        : { format: "text", content: cachedResult.result.student_summary });
      setAcademisPublishError(null);
      setAcademisPublishNotice(null);
      setAcademisApplyNotice(null);
      setAcademisError(null);
      setAcademisResultTab("student-summary");
      setIsAcademisResultOpen(true);
      return;
    }

    setIsAcademisLoading(true);
    setAcademisError(null);
    setAcademisInsight(null);
    setAcademisRequestContext(evaluationContext);
    setAcademisStudentSummary("");
    setAcademisPublishedContentDraft({ format: "text", content: "" });
    setAcademisPublishError(null);
    setAcademisPublishNotice(null);
    setAcademisApplyNotice(null);
    setAcademisResultTab("student-summary");
    setIsAcademisResultOpen(true);
    try {
      const response = await fetch("/api/instructor/academis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          submissionId,
          stageId: evaluationContext.stageId,
          stageTitle: evaluationContext.stageTitle,
          taskId: selectedTask.id,
          taskTitle: evaluationContext.taskTitle,
          taskPrompt: evaluationContext.taskPrompt,
          ...(selectedTask.modelAnswer?.trim() ? { model_answer: selectedTask.modelAnswer.trim() } : {}),
          studentResponse: evaluationContext.studentResponse,
          ...(evaluationContext.studentTranscript ? { student_transcript: evaluationContext.studentTranscript } : {}),
          ...(evaluationContext.transcriptSource ? { transcript_source: evaluationContext.transcriptSource } : {}),
          ...(evaluationContext.referenceTranscript ? { reference_transcript: evaluationContext.referenceTranscript } : {}),
          audio_response_submitted: evaluationContext.audioResponseSubmitted === true,
          instructorPrompt: evaluationContext.instructorPrompt,
          stageTaskContexts,
        }),
      });
      let payload: {
        error?: string;
        fallback?: boolean;
        insight?: unknown;
        insightSaved?: boolean;
        reportSaved?: boolean;
        report?: unknown;
      };
      try {
        payload = await response.json() as {
          error?: string;
          fallback?: boolean;
          insight?: unknown;
          insightSaved?: boolean;
          reportSaved?: boolean;
          report?: unknown;
        };
      } catch {
        throw new Error("Academis returned an invalid response.");
      }
      if (!response.ok) throw new Error(payload.error || "Academis could not complete the grading request.");
      if (!isAcademisInsight(payload.insight)) {
        throw new Error("Academis returned an incomplete grading result.");
      }
      const completedResult = {
        context: evaluationContext,
        result: payload.insight,
        stored: payload.reportSaved === true || payload.insightSaved === true,
        ...(isAcademisStoredReport(payload.report) ? { report: payload.report } : {}),
      };
      setAcademisInsight(completedResult);
      if (payload.fallback) {
        setAcademisError(payload.error || "Academis could not produce a valid evaluation. Please retry.");
      } else {
        setAcademisResultsByTask((results) => ({ ...results, [cacheKey]: completedResult }));
      }
      setAcademisStudentSummary(payload.insight.student_summary);
      setAcademisPublishedContentDraft(completedResult.report
        ? getAcademisPublishedEditorDraft(completedResult.report.published_content)
        : { format: "text", content: payload.insight.student_summary });
    } catch (error) {
      setAcademisError(error instanceof Error ? error.message : "Academis could not complete the grading request.");
    } finally {
      setIsAcademisLoading(false);
    }
  };
  const publishAcademisReport = async () => {
    const currentResult = academisInsight;
    const report = currentResult?.report;
    if (!currentResult || !report) {
      setAcademisPublishError("This evaluation has no stored report to publish.");
      return;
    }
    if (!hasPublishableAcademisContent(academisPublishedContentDraft)) {
      setAcademisPublishError("Add student-facing feedback before publishing.");
      return;
    }

    setIsPublishingAcademisReport(true);
    setAcademisPublishError(null);
    setAcademisPublishNotice(null);
    try {
      const response = await fetch("/api/instructor/academis/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          reportId: report.id,
          publishedContent: academisPublishedContentDraft,
        }),
      });
      let payload: {
        error?: string;
        report?: { published_content?: unknown; is_published?: boolean };
      };
      try {
        payload = await response.json() as typeof payload;
      } catch {
        throw new Error("The publication response was invalid.");
      }
      if (!response.ok) throw new Error(payload.error || "Unable to publish feedback.");
      if (!payload.report || payload.report.is_published !== true
        || !("published_content" in payload.report)) {
        throw new Error("The report was not marked as published.");
      }

      const updatedReport: AcademisStoredReport = {
        ...report,
        published_content: payload.report.published_content,
        is_published: true,
      };
      const updatedResult = { ...currentResult, report: updatedReport, stored: true };
      setAcademisInsight(updatedResult);
      setAcademisResultsByTask((results) => ({
        ...results,
        [JSON.stringify([submissionId, updatedResult.context.stageId, updatedResult.context.taskId])]: updatedResult,
      }));
      setAcademisPublishedContentDraft(getAcademisPublishedEditorDraft(updatedReport.published_content));
      setAcademisPublishNotice("Approved feedback is live in the student's Stage 7 report card.");
    } catch (error) {
      setAcademisPublishError(error instanceof Error ? error.message : "Unable to publish feedback.");
    } finally {
      setIsPublishingAcademisReport(false);
    }
  };
  const updateAcademisStudentFeedback = (rowIndex: string, studentFeedback: string) => {
    const draftRows = academisPublishedContentDraft.format === "markdown_table"
      ? academisPublishedContentDraft.rows.map((row, index) => (
        row[0] === rowIndex
          ? row.map((cell, columnIndex) => (columnIndex === 2 ? studentFeedback : cell))
          : row
      ))
      : undefined;
    if (draftRows && academisPublishedContentDraft.format === "markdown_table") {
      setAcademisPublishedContentDraft({ ...academisPublishedContentDraft, rows: draftRows });
    }
    if (!academisInsight) return;
    const diagnosticRows = academisInsight.result.diagnostic_table?.rows.map((row) => (
      row.index === rowIndex ? { ...row, student_feedback: studentFeedback } : row
    ));
    const criteriaScores = draftRows
      ? Object.fromEntries(getAcademisCriterionScoreEntries(draftRows).map(({ key, score }) => [key, score]))
      : academisInsight.result.criteria_scores;
    const summary = draftRows
      ? draftRows.map((row) => `${row[0]}. ${row[2] || ""}`).join("\n")
      : diagnosticRows?.map((row) => `${row.index}. ${row.student_feedback}`).join("\n")
        || academisInsight.result.student_summary;
    const diagnosticTable = diagnosticRows
      ? { rows: diagnosticRows, markdown: formatAcademisDiagnosticTable(diagnosticRows, true) }
      : undefined;
    const updatedInsight = {
      ...academisInsight,
      result: {
        ...academisInsight.result,
        criteria_scores: criteriaScores,
        overall_band_score: calculateAcademisScoreMean(criteriaScores),
        student_summary: summary,
        ...(diagnosticTable ? { diagnostic_table: diagnosticTable } : {}),
      },
    };
    setAcademisInsight(updatedInsight);
    setAcademisStudentSummary(summary);
    const cacheKey = JSON.stringify([
      submissionId,
      updatedInsight.context.stageId,
      updatedInsight.context.taskId,
    ]);
    setAcademisResultsByTask((results) => ({ ...results, [cacheKey]: updatedInsight }));
  };
  const updateAcademisAxis = (rowIndex: number, statusAxis: string) => {
    if (academisPublishedContentDraft.format !== "markdown_table") return;
    const rows = academisPublishedContentDraft.rows.map((row, index) => (
      index === rowIndex ? row.map((cell, columnIndex) => (columnIndex === 1 ? statusAxis : cell)) : row
    ));
    setAcademisPublishedContentDraft({ ...academisPublishedContentDraft, rows });
    if (!academisInsight) return;

    const criteriaScores = Object.fromEntries(
      getAcademisCriterionScoreEntries(rows).map(({ key, score }) => [key, score]),
    );
    const diagnosticTable = academisInsight.result.diagnostic_table
      ? {
        ...academisInsight.result.diagnostic_table,
        rows: academisInsight.result.diagnostic_table.rows.map((row) => {
          const updatedRow = rows.find((candidate) => candidate[0] === row.index);
          return updatedRow ? { ...row, status_axis: updatedRow[1] || "" } : row;
        }),
      }
      : undefined;
    const updatedInsight = {
      ...academisInsight,
      result: {
        ...academisInsight.result,
        criteria_scores: criteriaScores,
        overall_band_score: calculateAcademisScoreMean(criteriaScores),
        ...(diagnosticTable
          ? {
            diagnostic_table: {
              ...diagnosticTable,
              markdown: formatAcademisDiagnosticTable(diagnosticTable.rows, true),
            },
          }
          : {}),
      },
    };
    setAcademisInsight(updatedInsight);
    const cacheKey = JSON.stringify([
      submissionId,
      updatedInsight.context.stageId,
      updatedInsight.context.taskId,
    ]);
    setAcademisResultsByTask((results) => ({ ...results, [cacheKey]: updatedInsight }));
  };
  const updateAcademisCriterionScore = (criterion: string, score: number | null) => {
    if (academisPublishedContentDraft.format === "markdown_table") {
      const rowIndex = getAcademisCriterionScoreEntries(academisPublishedContentDraft.rows)
        .findIndex((entry) => entry.key === criterion);
      if (rowIndex >= 0) {
        updateAcademisAxis(
          rowIndex,
          formatAcademisAxisWithScore(academisPublishedContentDraft.rows[rowIndex][1] || "", score),
        );
        return;
      }
    }
    if (!academisInsight) return;
    const criteriaScores = { ...academisInsight.result.criteria_scores, [criterion]: score };
    const updatedInsight = {
      ...academisInsight,
      result: {
        ...academisInsight.result,
        criteria_scores: criteriaScores,
        overall_band_score: calculateAcademisScoreMean(criteriaScores),
      },
    };
    setAcademisInsight(updatedInsight);
    const cacheKey = JSON.stringify([
      submissionId,
      updatedInsight.context.stageId,
      updatedInsight.context.taskId,
    ]);
    setAcademisResultsByTask((results) => ({ ...results, [cacheKey]: updatedInsight }));
  };
  const updateAcademisPublishedTableCell = (rowIndex: number, columnIndex: number, value: string) => {
    if (columnIndex === 1) {
      updateAcademisAxis(rowIndex, value);
      return;
    }
    setAcademisPublishedContentDraft((draft) => {
      if (draft.format !== "markdown_table") return draft;
      return {
        ...draft,
        rows: draft.rows.map((row, index) => (
          index === rowIndex
            ? row.map((cell, currentColumnIndex) => (currentColumnIndex === columnIndex ? value : cell))
            : row
        )),
      };
    });
  };
  const academisReportTable = academisInsight
    ? getAcademisStoredReportTable(academisInsight.report, academisInsight.result)
    : null;
  const academisStudentPreviewTable = academisPublishedContentDraft.format === "markdown_table"
    ? academisPublishedContentDraft
    : academisReportTable
      ? {
        headers: academisReportTable.headers.slice(0, 3),
        rows: academisReportTable.rows.map((row) => row.slice(0, 3)),
      }
      : null;
  const academisInstructorOnlyTable = academisInsight
    ? getAcademisInstructorOnlyTable(academisInsight.report, academisInsight.result)
    : null;
  const openAcademisLibrary = () => {
    setAcademisPresetDrafts(academisPresets.map((preset) => ({ ...preset })));
    setAcademisCategoryDrafts(academisCategories.map((category) => ({ ...category })));
    const assignedPreset = academisPresets.find((preset) => (
      preset.stageId === activeStage?.id && preset.taskId === activeTask?.id
    ));
    setActiveAcademisCategoryId(assignedPreset?.categoryId
      || activeAcademisCategoryId
      || academisCategories[0]?.id
      || ALL_ACADEMIS_PROMPTS_CATEGORY_ID);
    setAcademisLibraryError(null);
    setIsAcademisLibraryOpen(true);
  };
  const deleteAcademisCategory = (categoryId: string) => {
    const category = academisCategoryDrafts.find((item) => item.id === categoryId);
    if (!category || !window.confirm(`Delete "${category.label}" and all prompts in it? Save changes to confirm permanent deletion.`)) return;
    const categories = academisCategoryDrafts.filter((category) => category.id !== categoryId);
    const presets = academisPresetDrafts.filter((preset) => preset.categoryId !== categoryId);
    setAcademisCategoryDrafts(categories);
    setAcademisPresetDrafts(presets);
    if (activeAcademisCategoryId === categoryId) {
      setActiveAcademisCategoryId(categories[0]?.id || ALL_ACADEMIS_PROMPTS_CATEGORY_ID);
    }
    if (academisPresetDrafts.some((preset) => preset.categoryId === categoryId && preset.id === activeAcademisPresetId)) {
      const fallback = presets.find((preset) => preset.isFavorite) || presets[0];
      if (fallback) {
        setActiveAcademisPresetId(fallback.id);
        setActiveAcademisCategoryId(fallback.categoryId);
        setAcademisPrompt(fallback.prompt);
      } else {
        setActiveAcademisPresetId("");
        setAcademisPrompt("");
      }
    }
    setAcademisLibraryError(null);
  };
  const unpinAcademisPreset = async (presetId: string) => {
    const wasActivePreset = activeAcademisPresetId === presetId;
    const presets = academisPresets.map((preset) => (
      preset.id === presetId ? { ...preset, isFavorite: false } : preset
    ));
    try {
      const response = await fetch("/api/instructor/academis-prompts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ categories: academisCategories, presets }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(isRecord(payload) && typeof payload.error === "string"
          ? payload.error
          : "Unable to update pinned Academis prompts.");
      }
      if (!isRecord(payload)) throw new Error("The updated Academis prompt library response is invalid.");
      const library = normalizeAcademisPromptLibrary(payload.library);
      setAcademisPresets(library.presets);
      setAcademisPresetDrafts((drafts) => drafts.map((preset) => (
        preset.id === presetId ? { ...preset, isFavorite: false } : preset
      )));
      if (wasActivePreset) {
        const fallback = library.presets.find((preset) => preset.isFavorite) || library.presets[0];
        if (fallback) activateAcademisPreset(fallback);
      }
      setAcademisLibraryError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update pinned Academis prompts.";
      setAcademisLibraryError(message);
      console.error("Academis prompt could not be unpinned:", error);
    }
  };
  const deleteAcademisPreset = async (preset: AcademisPromptPreset) => {
    if (!window.confirm(`Permanently delete "${preset.label || "this prompt"}" from your Prompt Library?`)) return;
    if (!academisPresets.some((item) => item.id === preset.id)) {
      const remainingDrafts = academisPresetDrafts.filter((item) => item.id !== preset.id);
      setAcademisPresetDrafts(remainingDrafts);
      if (activeAcademisPresetId === preset.id) {
        const fallback = remainingDrafts.find((item) => item.isFavorite) || remainingDrafts[0];
        if (fallback) {
          setActiveAcademisPresetId(fallback.id);
          setActiveAcademisCategoryId(fallback.categoryId);
          setAcademisPrompt(fallback.prompt);
        } else {
          setActiveAcademisPresetId("");
          setAcademisPrompt("");
        }
      }
      setAcademisLibraryError(null);
      return;
    }
    setDeletingAcademisPresetId(preset.id);
    setAcademisLibraryError(null);
    try {
      const response = await fetch("/api/instructor/academis-prompts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ presetId: preset.id }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(isRecord(payload) && typeof payload.error === "string"
          ? payload.error
          : "Unable to delete the Academis prompt.");
      }
      if (!isRecord(payload)) throw new Error("The updated Academis prompt library response is invalid.");
      const library = normalizeAcademisPromptLibrary(payload.library);
      setAcademisPresets(library.presets);
      setAcademisCategories(library.categories);
      setAcademisPresetDrafts((drafts) => drafts.filter((item) => item.id !== preset.id));
      if (activeAcademisPresetId === preset.id) {
        const fallback = library.presets.find((item) => item.isFavorite) || library.presets[0];
        if (fallback) {
          setActiveAcademisPresetId(fallback.id);
          setActiveAcademisCategoryId(fallback.categoryId);
          setAcademisPrompt(fallback.prompt);
        } else {
          setActiveAcademisPresetId("");
          setAcademisPrompt("");
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to delete the Academis prompt.";
      setAcademisLibraryError(message);
      console.error("Academis prompt could not be deleted:", error);
    } finally {
      setDeletingAcademisPresetId(null);
    }
  };
  const saveAcademisLibrary = async (
    presetDrafts = academisPresetDrafts,
    categoryDrafts = academisCategoryDrafts,
  ) => {
    const presets = presetDrafts.map((preset) => ({
      ...preset,
      label: preset.label.trim(),
      prompt: preset.prompt.trim(),
    }));
    const categories = categoryDrafts.map((category) => ({
      ...category,
      label: category.label.trim(),
    }));
    if (categories.some((category) => !category.label || category.label.length > 40)
      || new Set(categories.map((category) => category.id)).size !== categories.length
      || new Set(categories.map((category) => category.label.toLowerCase())).size !== categories.length) {
      setAcademisLibraryError("Give each category a unique title.");
      return;
    }
    if (presets.some((preset) => !preset.label
      || preset.label.length > 40
      || !preset.prompt
      || preset.prompt.length > MAX_INSTRUCTOR_PROMPT_LENGTH
      || !categories.some((category) => category.id === preset.categoryId))) {
      setAcademisLibraryError("Add a title and prompt to each preset and assign it to a category.");
      return;
    }
    if (new Set(presets.map((preset) => preset.id)).size !== presets.length
      || !areAcademisPromptTitlesUnique(presets)) {
      setAcademisLibraryError("Prompt titles must be unique within each category.");
      return;
    }
    if (presets.filter((preset) => preset.isFavorite).length > 3) {
      setAcademisLibraryError("Pin no more than 3 presets.");
      return;
    }
    setIsSavingAcademisLibrary(true);
    try {
      const response = await fetch("/api/instructor/academis-prompts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ categories, presets }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(isRecord(payload) && typeof payload.error === "string"
          ? payload.error
          : "Unable to save the Academis prompt library.");
      }
      if (!isRecord(payload)) throw new Error("The saved Academis prompt library response is invalid.");
      const library = normalizeAcademisPromptLibrary(payload.library);
      setAcademisPresets(library.presets);
      setAcademisCategories(library.categories);
      const assignedPreset = library.presets.find((preset) => (
        preset.stageId === activeStage?.id && preset.taskId === activeTask?.id
      ));
      const selectedPreset = library.presets.find((preset) => preset.id === activeAcademisPresetId)
        || assignedPreset
        || library.presets.find((preset) => preset.isFavorite)
        || library.presets[0];
      if (selectedPreset) {
        activateAcademisPreset(selectedPreset);
      } else {
        setActiveAcademisPresetId("");
        setActiveAcademisCategoryId(library.categories[0]?.id || ALL_ACADEMIS_PROMPTS_CATEGORY_ID);
        setAcademisPrompt("");
      }
      setAcademisPresetDrafts(library.presets);
      setAcademisCategoryDrafts(library.categories);
      setAcademisLibraryError(null);
      setIsAcademisLibraryOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save the Academis prompt library.";
      setAcademisLibraryError(`Could not save your prompts: ${message}`);
      console.error("Academis prompt library could not be saved:", error);
    } finally {
      setIsSavingAcademisLibrary(false);
    }
  };
  const clearAcademisPrompts = async () => {
    if (!academisPresets.length && !academisPresetDrafts.length) return;
    if (!window.confirm("Permanently delete all saved prompts? Categories will remain so you can add a new set.")) return;
    await saveAcademisLibrary([], academisCategoryDrafts);
  };
  const pinnedAcademisPresets = academisPresets.filter((preset) => preset.isFavorite).slice(0, 3);

  return <div className="space-y-5">
    {publishNotice && <div
      role={publishNotice.type === "error" ? "alert" : "status"}
      aria-live={publishNotice.type === "error" ? "assertive" : "polite"}
      className={`fixed right-6 top-6 z-[100] flex max-w-md items-start gap-3 rounded-lg border p-4 text-sm shadow-xl ${
        publishNotice.type === "success"
          ? "border-emerald-500/40 bg-[#111b18] text-emerald-200"
          : "border-red-500/40 bg-[#201416] text-red-200"
      }`}
    >
      <span className="flex-1">{publishNotice.message}</span>
      <button type="button" onClick={() => setPublishNotice(null)} className="shrink-0 text-xs opacity-75 hover:opacity-100" aria-label="Dismiss notification">Dismiss</button>
    </div>}
    <div className={`grid min-w-0 items-start gap-5 transition-[grid-template-columns] duration-300 ease-in-out ${
      isEvaluationSidebarCollapsed
        ? isAcademisSidebarCollapsed
          ? "lg:grid-cols-[3.5rem_minmax(0,1fr)] xl:grid-cols-[3.5rem_minmax(0,1fr)_3.5rem]"
          : "lg:grid-cols-[3.5rem_minmax(0,1fr)] xl:grid-cols-[3.5rem_minmax(0,1fr)_320px]"
        : isAcademisSidebarCollapsed
          ? "lg:grid-cols-[250px_minmax(0,1fr)] xl:grid-cols-[250px_minmax(0,1fr)_3.5rem]"
          : "lg:grid-cols-[250px_minmax(0,1fr)] xl:grid-cols-[250px_minmax(0,1fr)_320px]"
    }`}>
      <aside className={`flex min-w-0 flex-col rounded-xl border border-border bg-surface transition-[padding] duration-300 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] ${isEvaluationSidebarCollapsed ? "p-2" : "p-4"}`} aria-label="Evaluation tools">
        <div className={`flex shrink-0 items-center ${isEvaluationSidebarCollapsed ? "justify-center" : "justify-between gap-2"}`}>
          {!isEvaluationSidebarCollapsed && <div className="min-w-0">
            <p className="truncate text-[10px] font-semibold uppercase tracking-[0.15em] text-amber-400">Evaluation Studio</p>
            <h2 className="mt-1 truncate text-sm font-semibold text-stone-100">{studentName}</h2>
          </div>}
          <button
            type="button"
            onClick={() => setIsEvaluationSidebarCollapsed((collapsed) => !collapsed)}
            aria-label={isEvaluationSidebarCollapsed ? "Expand evaluation sidebar" : "Collapse evaluation sidebar"}
            aria-expanded={!isEvaluationSidebarCollapsed}
            aria-controls="evaluation-sidebar-content"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-border text-stone-300 transition hover:border-amber-500/40 hover:text-amber-400"
          >
            {isEvaluationSidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>
        <div id="evaluation-sidebar-content" hidden={isEvaluationSidebarCollapsed} className={`mt-4 min-h-0 flex-1 flex-col ${isEvaluationSidebarCollapsed ? "hidden" : "flex"}`}>
          <label className="block text-xs text-stone-400">
            <span className="mb-1.5 block font-medium text-stone-300">Scoring Scale</span>
            <select
              value={globalRubricScale}
              onChange={(event) => handleGlobalScaleChange(event.target.value as RubricScale)}
              className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-xs text-stone-200 outline-none focus:border-amber-500/40"
              aria-label="Global scoring scale for all stages"
            >
              {RUBRIC_SCALE_OPTIONS.map((scale) => <option key={scale.id} value={scale.id}>{scale.label}</option>)}
            </select>
          </label>
        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto py-4" aria-label="Stage status">
          {stages.map((stage, index) => {
            const status = evaluationStatus(stage.id);
            return <button
              key={stage.id}
              type="button"
              onClick={() => changeActiveStage(stage.id)}
              className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left transition ${activeStageId === stage.id ? "bg-amber-500/10 text-amber-200" : "text-stone-400 hover:bg-surface hover:text-stone-200"}`}
            >
              <span className="min-w-0 truncate text-xs"><span className="mr-2 font-mono text-[10px] text-stone-600">{String(index + 1).padStart(2, "0")}</span>{stage.title}</span>
              <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] ${stageStatusClass(status)}`}>{status}</span>
            </button>;
          })}
          <button
            type="button"
            onClick={() => changeActiveStage(reportStageId)}
            className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left transition ${activeStageId === reportStageId ? "bg-amber-500/10 text-amber-200" : "text-stone-400 hover:bg-surface hover:text-stone-200"}`}
          >
            <span className="text-xs"><span className="mr-2 font-mono text-[10px] text-stone-600">07</span>Report Card</span>
            <span className={`rounded-full border px-1.5 py-0.5 text-[9px] ${stageStatusClass(evaluation?.published ? "Evaluated" : "Pending Review")}`}>{evaluation?.published ? "Evaluated" : "Preview"}</span>
          </button>
        </nav>
        <div className="mt-auto shrink-0 space-y-2 border-t border-border pt-4">
          <button type="button" onClick={() => void handleSaveDraft()} disabled={isSavingDraft || isSubmitting || voiceUploadStage !== null || (usePostgres && submissionLoadState !== "loaded")} className="flex w-full items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-xs text-stone-200 transition hover:border-amber-500/40 disabled:cursor-wait disabled:opacity-50">
            <Save className="h-3.5 w-3.5" aria-hidden="true" />{isSavingDraft ? "Saving Draft..." : "Save Draft"}
          </button>
          <button type="button" onClick={() => changeActiveStage(reportStageId)} className="flex w-full items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-xs text-stone-200 transition hover:border-amber-500/40">
            <ClipboardCheck className="h-3.5 w-3.5" aria-hidden="true" />Jump to Report Card
          </button>
          <button type="button" onClick={() => void handleSubmit()} disabled={isSubmitting || isSubmitted || voiceUploadStage !== null || (usePostgres && submissionLoadState !== "loaded")} className="w-full rounded-md bg-amber-500/20 px-3 py-2.5 text-xs font-semibold text-amber-300 transition hover:bg-amber-500/30 disabled:cursor-wait disabled:opacity-50">
            {isSubmitting ? "Publishing..." : isSubmitted ? "Evaluation Published" : "Publish Evaluation"}
          </button>
          {draftStatus && <p role="status" className="text-[11px] leading-relaxed text-emerald-300">{draftStatus}</p>}
        </div>
        </div>
      </aside>

      <section className="min-w-0 space-y-5" aria-label={`${activeStageTitle} evaluation`}>
        {activeStageId === reportStageId ? <div className="space-y-5">
          {stageStepper}
          {stageHeading}
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
            <p className="text-sm font-medium text-amber-200">Compiled Report Card Preview</p>
            <p className="mt-1 text-xs leading-relaxed text-stone-400">Review the scores, comments, corrections, and voice notes collected across all six lesson stages before publishing to {studentName}.</p>
          </div>
          <section className="space-y-3 rounded-xl border border-border bg-surface/60 p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-stone-100">Overall Rubric</h3>
              <span className="text-xs text-amber-300">{formatOverallRubricTotal(totalScore, overallScaleId, overallAggregation.totalDenominator)}</span>
            </div>
            <p className="text-[11px] leading-relaxed text-stone-500">Each criterion starts as the average of its ratings across stages. Adjust a score here to fine-tune the final report.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {RUBRIC_CRITERIA.map((criterion) => <div key={criterion.id} className="rounded-lg border border-border bg-background p-3">
                <div className="flex justify-between gap-2 text-xs"><span className="text-stone-300">{criterion.label}</span><span className="text-amber-300">{displayScores[criterion.id] === undefined ? `—/${overallScale.max}` : `${formatRubricScore(displayScores[criterion.id])}/${overallScale.max}`}</span></div>
                {stageAverages[criterion.id] !== undefined && <p className="mt-1 text-[10px] text-stone-500">{reportCardScoreOverrides[criterion.id] !== undefined ? `Stage average: ${formatRubricScore(roundRubricScoreForScale(displayRubricScore(stageAverages[criterion.id] ?? 0, overallScaleId), overallScaleId))}/${overallScale.max} · Manually adjusted` : `Average of ${overallAggregation.criterionStageCounts[criterion.id]} stage ratings`}</p>}
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="range"
                    min={overallScale.min}
                    max={overallScale.max}
                    step={overallScale.step}
                    value={displayScores[criterion.id] ?? overallScale.min}
                    onChange={(event) => handleScoreChange(criterion.id, Number(event.target.value))}
                    className="min-w-0 flex-1 accent-amber-500"
                    aria-label={`${criterion.label} score`}
                  />
                  <input
                    type="number"
                    min={overallScale.min}
                    max={overallScale.max}
                    step={overallScale.step}
                    value={displayScores[criterion.id] ?? overallScale.min}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      if (event.target.value !== "" && Number.isFinite(value) && value >= overallScale.min && value <= overallScale.max) {
                        handleScoreChange(criterion.id, value);
                      }
                    }}
                    className="rubric-score-input w-16 rounded border border-border bg-surface px-2 py-1 text-center text-xs text-amber-300 outline-none focus:border-amber-500/40"
                    aria-label={`${criterion.label} score value`}
                  />
                </div>
                <textarea value={criterionFeedback[criterion.id] || ""} onChange={(event) => updateEvaluation({ criterionFeedback: { ...criterionFeedback, [criterion.id]: event.target.value } })} rows={2} placeholder={`Feedback for ${criterion.label.toLowerCase()}...`} className="mt-2 w-full resize-y rounded-md border border-border bg-surface p-2 text-xs text-stone-200 outline-none focus:border-amber-500/40" />
              </div>)}
            </div>
          </section>
          {stages.map((stage, index) => <section key={stage.id} className="space-y-3 rounded-xl border border-border bg-surface/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
              <h3 className="text-sm font-semibold text-stone-100">{String(index + 1).padStart(2, "0")} · {stage.title}</h3>
              <span className={`rounded-full border px-2 py-0.5 text-[9px] ${stageStatusClass(evaluationStatus(stage.id))}`}>{evaluationStatus(stage.id)}</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {STAGE_RUBRIC_CRITERIA.map((criterion) => {
                const scale = getRubricScale(stageRubricScales[stage.id]);
                return <label key={criterion.id} className="rounded-md border border-border bg-background p-2 text-[10px] text-stone-400">{criterion.label}<span className="float-right text-amber-300">{formatRubricScore(roundRubricScoreForScale(stageScores[stage.id]?.[criterion.id] || 0, stageRubricScales[stage.id]))}/{scale.max}</span></label>;
              })}
              {(() => {
                const scaleId = stageRubricScales[stage.id];
                const scale = getRubricScale(scaleId);
                const stageOverallScore = calculateStageOverallScore(
                  stageScores[stage.id] || {},
                  STAGE_RUBRIC_CRITERIA.map(({ id }) => id),
                  scaleId,
                );
                return stageOverallScore === undefined ? null : <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-[10px] font-semibold text-amber-200">
                  Stage Overall Score<span className="float-right text-amber-300">{formatRubricScore(stageOverallScore)}/{scale.max}</span>
                </div>;
              })()}
            </div>
            {stageFeedback[stage.id]?.trim() && <p className="whitespace-pre-wrap rounded-md bg-background p-3 text-xs leading-relaxed text-stone-300">{stageFeedback[stage.id]}</p>}
            {stage.tasks.map((task) => <div key={task.id} className="space-y-1 rounded-md border border-border bg-background p-3 text-xs">
              <p className="font-medium text-stone-300">{task.title}</p>
              {combineTaskFeedback(taskFeedback[task.id], inlineCorrections[task.id]) && <div className="mt-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-300">INSTRUCTOR FEEDBACK &amp; CORRECTION</p>
                <TiptapEditor value={combineTaskFeedback(taskFeedback[task.id], inlineCorrections[task.id])} onChange={() => {}} ariaLabel={`${task.title} instructor feedback`} readOnly />
              </div>}
            </div>)}
            {stageVoiceFeedback[stage.id] && <div className="space-y-1"><p className="text-[10px] text-stone-500">Voice note</p><CustomAudioPlayer src={stageVoiceFeedback[stage.id]} label={`${stage.title} instructor voice note`} /></div>}
          </section>)}
          <section className="space-y-3 rounded-xl border border-border bg-surface/60 p-4">
            <h3 className="text-sm font-semibold text-stone-100">Final Student Feedback</h3>
            <textarea value={comments} onChange={(event) => updateEvaluation({ comments: event.target.value })} rows={4} placeholder="Personalized feedback and corrections..." className="w-full resize-y rounded-md border border-border bg-background p-3 text-sm text-stone-200 outline-none focus:border-amber-500/40" aria-label="Personalized feedback" />
            <div className="grid gap-3 sm:grid-cols-2">
              <textarea value={evaluation?.strengths || ""} onChange={(event) => updateEvaluation({ strengths: event.target.value })} rows={3} placeholder="Specific strengths..." className="w-full resize-y rounded-md border border-border bg-background p-3 text-xs text-stone-200 outline-none focus:border-amber-500/40" aria-label="Student strengths" />
              <textarea value={evaluation?.areasToImprove || ""} onChange={(event) => updateEvaluation({ areasToImprove: event.target.value })} rows={3} placeholder="Focused next steps..." className="w-full resize-y rounded-md border border-border bg-background p-3 text-xs text-stone-200 outline-none focus:border-amber-500/40" aria-label="Areas to improve" />
            </div>
            <textarea value={evaluation?.studyHubPrescription || ""} onChange={(event) => updateEvaluation({ studyHubPrescription: event.target.value })} rows={2} placeholder="Recommended study resource or topic..." className="w-full resize-y rounded-md border border-border bg-background p-3 text-xs text-stone-200 outline-none focus:border-amber-500/40" aria-label="Study Hub prescription" />
          </section>
        </div> : activeStage ?         <div className="min-w-0 space-y-5">
          <div className="min-w-0 space-y-5">
            {stageStepper}
            {stageHeading}
            {(activeStage.id === "reading" || activeStage.id === "listening") && (activeStage.referenceText || activeStage.referenceAudioUrl) && <details className="rounded-lg border border-border bg-surface p-3">
              <summary className="cursor-pointer text-xs font-medium text-stone-300">Show lesson reference</summary>
              {activeStage.referenceText && <p className="mt-3 whitespace-pre-wrap text-xs leading-relaxed text-stone-400">{stripMarkdown(activeStage.referenceText)}</p>}
              {activeStage.referenceAudioUrl && <div className="mt-3"><CustomAudioPlayer src={activeStage.referenceAudioUrl} label={`${activeStage.title} lesson reference audio`} /></div>}
            </details>}
            {activeStage.tasks.length ? activeStage.tasks.map((task, index) => {
              const feedbackSectionId = `${activeStage.id}:${task.id}`;
              const isFeedbackExpanded = expandedTaskFeedback[feedbackSectionId] ?? false;
              const normalizedAnswer = task.studentAnswer ? normalizeAnswer(task.studentAnswer) : "";
              const matchesCorrectAnswer = task.modelAnswer?.split(/[\/|]/).some(
                (candidate) => normalizeAnswer(candidate) === normalizedAnswer,
              ) ?? false;
              const isObjectiveAnswer = Boolean(task.studentAnswer?.trim())
                && (task.isCorrect !== undefined || task.autoCheck === true);
              const isCorrect = task.isCorrect !== undefined ? task.isCorrect : task.autoCheck === true && matchesCorrectAnswer;
              const responseBoxClass = isCorrect
                ? "border-emerald-500/30 bg-emerald-500/5"
                : isObjectiveAnswer
                  ? "border-rose-500/30 bg-rose-500/5"
                  : "border-border bg-background";
              const responseLabelClass = isCorrect
                ? "text-emerald-300"
                : isObjectiveAnswer
                  ? "text-rose-300"
                  : "text-stone-400";
              const responseTextClass = isCorrect
                ? "text-emerald-100"
                : isObjectiveAnswer
                  ? "text-rose-100"
                  : "text-stone-200";
              const modelBoxClass = "border-emerald-500/30 bg-emerald-500/5";
              const modelLabelClass = "text-emerald-300";
              const modelTextClass = "text-emerald-100";
              const taskEvaluationText = getTaskEvaluationText(task);
              const taskReportCacheKey = submissionId
                ? JSON.stringify([submissionId, activeStage.id, task.id])
                : "";
              const taskReport = academisResultsByTask[taskReportCacheKey];
              return <article
                key={task.id}
                onClick={() => {
                  if (activeTask?.id !== task.id) {
                    setActiveTaskId(task.id);
                    setAcademisInsight(null);
                    setAcademisError(null);
                  }
                }}
                onFocusCapture={() => {
                  if (activeTask?.id !== task.id) {
                    setActiveTaskId(task.id);
                    setAcademisInsight(null);
                    setAcademisError(null);
                  }
                }}
                className={`space-y-3 rounded-xl border bg-surface p-4 ${activeTask?.id === task.id ? "border-amber-500/30" : "border-border"}`}
              >
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">Task Prompt {task.taskNumber ?? index + 1}</p>
                  <h3 className="mt-1 whitespace-pre-wrap break-words text-sm font-medium leading-relaxed text-stone-100">{stripMarkdown(task.prompt || task.title || "Task prompt not available.")}</h3>
                </div>
                <div className={`rounded-lg border p-4 ${responseBoxClass}`}>
                  <p className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${responseLabelClass}`}>{taskEvaluationText?.source === "shadowing_reference" ? "Shadowing transcript" : taskEvaluationText?.source === "student" ? "Student transcript" : "Student response"}</p>
                  {taskEvaluationText && taskEvaluationText.source !== "task_answer" && <details open className="mt-2 rounded-md border border-border bg-surface px-3 py-2">
                    <summary className="cursor-pointer text-xs font-medium text-stone-300">{taskEvaluationText.source === "shadowing_reference" ? "Shadowing transcript" : "Transcript"}</summary>
                    <p className="mt-2 whitespace-pre-wrap break-words py-1 text-sm leading-relaxed text-stone-200">{stripMarkdown(taskEvaluationText.text)}</p>
                  </details>}
                  {task.referenceTranscript?.trim() && taskEvaluationText?.source !== "shadowing_reference" && <details open className="mt-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2">
                    <summary className="cursor-pointer text-xs font-medium text-amber-300">Shadowing source transcript</summary>
                    <p className="mt-2 whitespace-pre-wrap break-words py-1 text-sm leading-relaxed text-stone-200">{stripMarkdown(task.referenceTranscript)}</p>
                  </details>}
                  {(!taskEvaluationText || taskEvaluationText.source === "task_answer") && <p className={`mt-2 whitespace-pre-wrap break-words rounded-sm px-2 py-3 text-sm leading-relaxed ${isCorrect ? "bg-emerald-300/10" : isObjectiveAnswer ? "bg-rose-300/10" : "bg-surface"} ${responseTextClass}`}>{stripMarkdown(taskEvaluationText?.text || task.studentAnswer) || <span className="italic text-stone-500">No response submitted.</span>}</p>}
                  {task.audioUrls?.map((url, audioIndex) => <div key={`${url}-${audioIndex}`} className="mt-2"><CustomAudioPlayer src={url} label={`${task.prompt || task.title || "Task"} student recording`} /></div>)}
                </div>
                {task.modelAnswer && <div className={`rounded-md border p-4 ${modelBoxClass}`}>
                  <p className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${modelLabelClass}`}>Model answer</p>
                  <p className={`mt-2 whitespace-pre-wrap py-2 text-sm leading-relaxed ${modelTextClass}`}>{stripMarkdown(task.modelAnswer)}</p>
                </div>}
                {taskScores[task.id] && <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-200">Task rubric scores</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 xl:grid-cols-4">
                    {RUBRIC_CRITERIA.map((criterion) => <p key={criterion.id} className="text-[10px] text-stone-400">
                      {criterion.label}<span className="float-right text-amber-200">{formatRubricScore(taskScores[task.id][criterion.id] || 0)}/{getRubricScale(taskRubricScales[task.id]).max}</span>
                    </p>)}
                  </div>
                </div>}
                <div>
                  <button
                    type="button"
                    aria-expanded={isFeedbackExpanded}
                    aria-controls={`task-feedback-editor-${index}`}
                    onClick={() => setExpandedTaskFeedback((current) => ({
                      ...current,
                      [feedbackSectionId]: !isFeedbackExpanded,
                    }))}
                    className="flex w-full items-center gap-2 rounded-md py-1 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-300 transition hover:text-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50"
                  >
                    {isFeedbackExpanded
                      ? <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      : <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                    INSTRUCTOR FEEDBACK &amp; CORRECTION
                  </button>
                  <div
                    id={`task-feedback-editor-${index}`}
                    className={`grid transition-[grid-template-rows] duration-200 ease-in-out ${isFeedbackExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
                    aria-hidden={!isFeedbackExpanded}
                    inert={!isFeedbackExpanded}
                  >
                    <div className="min-h-0 overflow-hidden">
                      <TiptapEditor
                        value={combineTaskFeedback(taskFeedback[task.id], inlineCorrections[task.id])}
                        onChange={(value) => updateEvaluation({
                          taskFeedback: { ...taskFeedback, [task.id]: value },
                          inlineCorrections: Object.fromEntries(Object.entries(inlineCorrections).filter(([id]) => id !== task.id)),
                        })}
                        placeholder="Write a correction, explanation, or note about this response..."
                        ariaLabel={`${task.prompt || task.title || "Task"} instructor feedback and correction`}
                        compact
                        wrapToolbar
                      />
                    </div>
                  </div>
                </div>
                {taskReport && <details className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3">
                  <summary className="cursor-pointer text-[10px] font-semibold text-amber-200">Academis diagnostic · {taskReport.context.taskTitle}</summary>
                  <div className="mt-3 space-y-3 border-t border-amber-500/10 pt-3">
                    {taskReport.result.diagnostic_table && <AcademisDiagnosticTableView
                      rows={taskReport.result.diagnostic_table.rows}
                      includeInstructorColumn
                    />}
                    <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-stone-300">{taskReport.result.instructor_diagnostic.teaching_notes}</p>
                    {taskReport.result.instructor_diagnostic.key_error_patterns.length > 0 && <div>
                      <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-stone-500">Error patterns</p>
                      <ul className="space-y-2">
                        {taskReport.result.instructor_diagnostic.key_error_patterns.map((pattern, patternIndex) => <li key={`${pattern.pattern}-${patternIndex}`} className="rounded-md border border-border bg-background/70 p-2 text-[10px]">
                          <p className="font-medium text-stone-200">{pattern.pattern}</p>
                          <p className="mt-0.5 text-stone-500">{pattern.example}</p>
                          <p className="mt-1 text-amber-300/80">Lesson adjustment: {pattern.lesson_adjustment}</p>
                        </li>)}
                      </ul>
                    </div>}
                    {taskReport.result.instructor_diagnostic.targeted_resources.length > 0 && <div>
                      <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-stone-500">Resource recommendations</p>
                      <ul className="space-y-1.5">
                        {taskReport.result.instructor_diagnostic.targeted_resources.map((resource, resourceIndex) => <li key={`${resource.topic}-${resourceIndex}`} className="text-[10px]">
                          <span className="font-medium text-stone-200">{resource.title}</span>
                          <span className="text-stone-500"> · {resource.topic} — {resource.reason}</span>
                        </li>)}
                      </ul>
                    </div>}
                    <p className={`text-[10px] ${taskReport.stored ? "text-emerald-400/80" : "text-amber-300/80"}`}>
                      {taskReport.stored ? "Report saved for this submission." : "Report is available for this session; database storage was unavailable."}
                    </p>
                  </div>
                </details>}
              </article>;
            }) : <div className="rounded-lg border border-dashed border-border bg-surface p-5 text-center">
              <p className="text-sm font-medium text-stone-300">No interactive response in this stage</p>
              <p className="mt-1 text-xs text-stone-500">You can still add a stage score and instructor feedback.</p>
            </div>}
          </div>

          <section className="space-y-4 rounded-xl border border-border bg-surface/60 p-4" aria-label={`${activeStage.title} stage rubric`}>
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-3">
              <div>
                <h3 className="text-sm font-semibold text-stone-100">Stage Rubric</h3>
                <p className="mt-1 text-[10px] text-stone-500">Choose a scoring scale for {activeStage.title}, then rate each criterion.</p>
              </div>
              <label className="flex items-center gap-2 text-xs text-stone-400">
                Scoring scale
                <select
                  value={stageRubricScales[activeStage.id] || globalRubricScale}
                  onChange={(event) => {
                    const nextScale = event.target.value as RubricScale;
                    const currentScale = stageRubricScales[activeStage.id] || globalRubricScale;
                    updateEvaluation({
                      stageRubricScales: { ...stageRubricScales, [activeStage.id]: nextScale },
                      stageScores: {
                        ...stageScores,
                        [activeStage.id]: Object.fromEntries(
                          Object.entries(stageScores[activeStage.id] || {}).map(([criterionId, score]) => [
                            criterionId,
                            convertRubricScore(score, currentScale, nextScale),
                          ]),
                        ),
                      },
                    });
                  }}
                  className="rounded-md border border-border bg-background px-2.5 py-2 text-xs text-stone-200 outline-none focus:border-amber-500/40"
                  aria-label={`${activeStage.title} rubric scoring scale`}
                >
                  {RUBRIC_SCALE_OPTIONS.map((scale) => <option key={scale.id} value={scale.id}>{scale.label}</option>)}
                </select>
              </label>
            </div>
            <div className="divide-y divide-border">
              {STAGE_RUBRIC_CRITERIA.map((criterion) => {
                const scale = getRubricScale(stageRubricScales[activeStage.id]);
                const score = stageScores[activeStage.id]?.[criterion.id];
                return <div key={criterion.id} className="grid gap-2 py-3 sm:grid-cols-[minmax(180px,0.8fr)_minmax(0,2fr)_96px] sm:items-center">
                  <label htmlFor={`stage-score-${activeStage.id}-${criterion.id}`} className="text-xs font-medium text-stone-300">{criterion.label}</label>
                  <input
                    id={`stage-score-${activeStage.id}-${criterion.id}`}
                    type="range"
                    min={scale.min}
                    max={scale.max}
                    step={scale.step}
                    value={score ?? scale.min}
                    onChange={(event) => updateEvaluation({
                      stageScores: {
                        ...stageScores,
                        [activeStage.id]: { ...stageScores[activeStage.id], [criterion.id]: Number(event.target.value) },
                      },
                    })}
                    className="w-full accent-amber-500"
                    aria-label={`${activeStage.title} ${criterion.label}`}
                  />
                  <div className="flex items-center gap-2 sm:justify-end">
                    <input
                      type="number"
                      min={scale.min}
                      max={scale.max}
                      step={scale.step}
                      value={score ?? ""}
                      onChange={(event) => {
                        const value = event.target.value === "" ? undefined : Number(event.target.value);
                        if (value === undefined || (Number.isFinite(value) && value >= scale.min && value <= scale.max)) {
                          updateEvaluation({
                            stageScores: {
                              ...stageScores,
                              [activeStage.id]: value === undefined
                                ? Object.fromEntries(Object.entries(stageScores[activeStage.id] || {}).filter(([id]) => id !== criterion.id))
                                : { ...stageScores[activeStage.id], [criterion.id]: value },
                            },
                          });
                        }
                      }}
                      className="rubric-score-input w-full rounded-md border border-border bg-background px-3 py-2 text-center text-xs text-amber-300 outline-none transition-colors hover:border-amber-500/30 focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20"
                      aria-label={`${activeStage.title} ${criterion.label} score value`}
                    />
                    <span className="text-[10px] text-stone-500">{score === undefined ? "—" : `/${scale.max}`}</span>
                  </div>
                </div>;
              })}
            </div>
            <label className="block border-t border-border pt-3 text-xs font-medium text-stone-300">Stage feedback
              <textarea value={stageFeedback[activeStage.id] || ""} onChange={(event) => updateEvaluation({ stageFeedback: { ...stageFeedback, [activeStage.id]: event.target.value } })} rows={3} placeholder={`Comments on ${activeStage.title.toLowerCase()}...`} className="mt-1 w-full resize-y rounded-md border border-border bg-background p-3 text-xs font-normal leading-relaxed text-stone-200 outline-none focus:border-amber-500/40" />
            </label>
            {(activeStage.id === "listening" || activeStage.id === "speaking") && <div className="space-y-2 border-t border-border pt-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-stone-200"><Mic className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />Audio feedback note</div>
              <AudioRecorder onBlob={(blob) => { void uploadStageVoiceNote(activeStage.id, blob); }} onError={setVoiceUploadError} disabled={voiceUploadStage === activeStage.id || isSubmitting} label={`Record ${activeStage.title.toLowerCase()} feedback`} />
              <label className="block text-[10px] text-stone-400">Or attach an audio file
                <input type="file" accept="audio/*" disabled={voiceUploadStage === activeStage.id || isSubmitting} onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file && !file.type.startsWith("audio/")) { setVoiceUploadError("Choose a valid audio file."); } else if (file) { void uploadStageVoiceNote(activeStage.id, file); } event.currentTarget.value = ""; }} className="mt-1 block w-full text-[10px] text-stone-400 file:mr-2 file:rounded file:border-0 file:bg-border file:px-2 file:py-1.5 file:text-[10px] file:text-stone-200" />
              </label>
              {voiceUploadStage === activeStage.id && <p role="status" className="text-[10px] text-amber-300">Uploading voice note...</p>}
              {voiceUploadError && <p role="alert" className="text-[10px] text-red-300">{voiceUploadError}</p>}
              {stageVoiceFeedback[activeStage.id] && <div className="space-y-2">
                <CustomAudioPlayer src={stageVoiceFeedback[activeStage.id]} label={`${activeStage.title} instructor voice note`} />
                <button type="button" onClick={() => updateEvaluation({ stageVoiceFeedback: { ...stageVoiceFeedback, [activeStage.id]: "" } })} className="text-[10px] text-stone-500 underline hover:text-red-300">Remove voice note</button>
              </div>}
            </div>}
          </section>
          {activeStageSummary && <section className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-300">Stage Summary / Diagnostic Overview</p>
            <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-stone-200">{activeStageSummary}</p>
          </section>}
        </div> : null}

        {feedbackError && <p role="alert" className="rounded-lg border border-red-700 bg-red-900/30 p-3 text-xs text-red-200">{feedbackError}</p>}
        {draftStatus && <p role="status" className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-300">{draftStatus}</p>}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <button type="button" onClick={() => changeActiveStage(activeStageIndex <= 0 ? reportStageId : activeStageIndex === reportStageIndex ? stages[stages.length - 1]?.id || reportStageId : stages[activeStageIndex - 1]?.id || reportStageId)} disabled={activeStageIndex <= 0} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs text-stone-300 transition hover:border-amber-500/40 disabled:cursor-not-allowed disabled:opacity-40">
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />Previous Stage
          </button>
          <button type="button" onClick={() => changeActiveStage(activeStageIndex >= reportStageIndex ? reportStageId : activeStageIndex === reportStageIndex - 1 ? reportStageId : stages[activeStageIndex + 1]?.id || reportStageId)} disabled={activeStageIndex >= reportStageIndex} className="inline-flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-40">
            Next Stage<ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
        {activeStageId === reportStageId && <button type="button" onClick={() => void handleSubmit()} disabled={isSubmitting || isSubmitted || voiceUploadStage !== null || (usePostgres && submissionLoadState !== "loaded")} className="w-full rounded-lg bg-amber-500/20 px-6 py-3 text-sm font-semibold text-amber-300 transition hover:bg-amber-500/30 disabled:cursor-wait disabled:opacity-50">
          {isSubmitting ? "Publishing..." : isSubmitted ? "Evaluation Published" : "Publish Evaluation & Send to Student"}
        </button>}
      </section>

      <aside className={`flex min-w-0 flex-col rounded-xl border border-amber-500/20 bg-surface transition-[padding] duration-300 xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] ${isAcademisSidebarCollapsed ? "p-2" : "p-4"}`} aria-label="Academis AI grading assistant">
        <div className={`flex shrink-0 items-center ${isAcademisSidebarCollapsed ? "justify-center" : "justify-between gap-2"}`}>
          {!isAcademisSidebarCollapsed && <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-300"><Sparkles className="h-4 w-4" aria-hidden="true" /></span>
            <div className="min-w-0">
              <p className="truncate text-[10px] font-semibold uppercase tracking-[0.15em] text-amber-400">Academis</p>
              <h2 className="truncate text-sm font-semibold text-stone-100">AI Grading Assistant</h2>
            </div>
          </div>}
          <button
            type="button"
            onClick={() => setIsAcademisSidebarCollapsed((collapsed) => !collapsed)}
            aria-label={isAcademisSidebarCollapsed ? "Expand Academis assistant" : "Collapse Academis assistant"}
            aria-expanded={!isAcademisSidebarCollapsed}
            aria-controls="academis-sidebar-content"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-border text-stone-300 transition hover:border-amber-500/40 hover:text-amber-400"
          >
            {isAcademisSidebarCollapsed ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </div>
        <div id="academis-sidebar-content" hidden={isAcademisSidebarCollapsed} className={`mt-4 min-h-0 flex-1 flex-col gap-3 overflow-y-auto ${isAcademisSidebarCollapsed ? "hidden" : "flex"}`}>
          <label className="block rounded-md border border-border bg-background/60 p-2.5 text-[10px] text-stone-400">
            Task to evaluate · {activeStage?.title || "Choose a stage"}
            <select
              value={activeTask?.id || ""}
              onChange={(event) => {
                setActiveTaskId(event.target.value);
                if (activeStage) applyAcademisTaskPrompt(activeStage.id, event.target.value);
                setAcademisInsight(null);
                setAcademisError(null);
              }}
              disabled={!activeStage?.tasks.length || isAcademisLoading || isAcademisLibraryLoading}
              aria-label={`Task to evaluate in ${activeStage?.title || "current stage"}`}
              className="mt-1.5 w-full rounded-md border border-border bg-[#0b0e13] px-2.5 py-2 text-xs text-stone-200 outline-none transition focus:border-amber-500/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {!activeStage?.tasks.length && <option value="">No tasks in this stage</option>}
              {activeStage?.tasks.map((task, index) => {
                const title = stripMarkdown(task.title || task.prompt || `Task ${index + 1}`)
                  .replace(/\s+/g, " ")
                  .trim();
                const prompt = task.prompt?.trim()
                  ? stripMarkdown(task.prompt).replace(/\s+/g, " ").trim()
                  : "";
                const optionLabel = prompt && prompt !== title ? `${title} — ${prompt}` : title;
                return <option key={task.id} value={task.id}>
                  {`${String(index + 1).padStart(2, "0")} · ${optionLabel.slice(0, 140)}${optionLabel.length > 140 ? "…" : ""}`}
                </option>;
              })}
            </select>
          </label>
          {activeTask && <>
            <details className="group rounded-md border border-border bg-background/60">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500/60">
                Selected Task
                <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <p className="px-2.5 pb-2.5 break-words text-xs font-medium text-stone-200">{activeTask.title?.trim() || "Untitled task"}</p>
            </details>
            <details className="group rounded-md border border-border bg-background/60">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500/60">
                Task prompt
                <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <p className="max-h-20 overflow-y-auto whitespace-pre-wrap break-words px-2.5 pb-2.5 text-[10px] leading-relaxed text-stone-300">
                {stripMarkdown(activeTaskPrompt || "No task prompt is available.")}
              </p>
            </details>
            <details className="group rounded-md border border-border bg-background/60">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500/60">
                Student Response
                <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <p className="max-h-20 overflow-y-auto whitespace-pre-wrap break-words px-2.5 pb-2.5 text-[10px] leading-relaxed text-stone-300">
                {activeTaskEvaluationText?.text
                  ? stripMarkdown(activeTaskEvaluationText.text)
                  : activeTask.audioUrls?.length ? "Audio response submitted; transcript unavailable."
                    : "No written response submitted."}
              </p>
            </details>
          </>}

          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-400">Pinned Prompt</p>
            <button
              type="button"
              onClick={openAcademisLibrary}
              disabled={isAcademisLibraryLoading}
              aria-label="Open Academis prompt library"
              title="Prompt Library"
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] text-stone-400 transition hover:border-amber-500/40 hover:text-amber-300 disabled:cursor-wait disabled:opacity-50"
            >
              <Settings2 className="h-3 w-3" aria-hidden="true" />
              Prompt Library
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5" aria-label="Pinned evaluation prompt presets">
            {pinnedAcademisPresets.map((preset) => <div key={preset.id} className={`inline-flex items-center rounded-full border text-[10px] transition ${activeAcademisPresetId === preset.id ? "border-amber-500/40 bg-amber-500/10 text-amber-200" : "border-border text-stone-400 hover:border-amber-500/30 hover:text-stone-200"}`}>
              <button
                type="button"
                aria-pressed={activeAcademisPresetId === preset.id}
                onClick={() => {
                  activateAcademisPreset(preset);
                }}
                className="inline-flex items-center gap-1 py-1 pl-2.5 pr-1"
              >
                <Star className="h-2.5 w-2.5 fill-current text-amber-400" aria-hidden="true" />
                {preset.label}
              </button>
              <button
                type="button"
                onClick={() => unpinAcademisPreset(preset.id)}
                aria-label={`Unpin ${preset.label} from quick access`}
                title="Remove from quick access"
                className="mr-1 rounded-full p-0.5 text-stone-500 transition hover:bg-amber-500/15 hover:text-amber-200"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </div>)}
            {!pinnedAcademisPresets.length && <p className="text-[10px] text-stone-500">Pin prompts in Prompt Library to add quick picks.</p>}
          </div>
          <section className="rounded-md border border-amber-500/25 bg-amber-500/5 p-2.5" aria-label="Active Academis prompt">
            <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-amber-400">Active evaluation prompt</p>
            <p className="mt-1 text-[10px] font-medium text-stone-200">
              {activeAcademisPreset?.label || "Custom prompt"}
              {activeAcademisPresetId && !activeAcademisPreset ? " · custom" : ""}
            </p>
            <p className="mt-1 max-h-20 overflow-y-auto whitespace-pre-wrap break-words text-[10px] leading-relaxed text-stone-400">
              {academisPrompt.trim() || "No evaluation prompt selected."}
            </p>
          </section>

          <button
            type="button"
            onClick={() => void generateAcademisInsight(!hasMatchingCachedAcademisResult)}
            disabled={isAcademisLoading || !submissionId || !activeTask}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-amber-500/20 px-3 py-2 text-xs font-semibold text-amber-200 transition hover:bg-amber-500/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            {isAcademisLoading
              ? "Evaluating…"
              : !submissionId
                ? submissionLoadState === "loading" ? "Loading submission…" : "Submission unavailable"
                : !activeTask
                  ? "Select a task to evaluate"
                  : hasMatchingCachedAcademisResult ? "View Last Evaluation Report"
                    : "Evaluate with Academis"}
          </button>
        </div>
      </aside>
    </div>
    {isAcademisLibraryOpen && <div
      className="fixed inset-0 z-[120] flex justify-end bg-black/70 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSavingAcademisLibrary && !deletingAcademisPresetId) {
          setIsAcademisLibraryOpen(false);
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="academis-library-title"
        className="flex h-full w-full max-w-6xl flex-col overflow-hidden border-l border-amber-500/30 bg-[#11151b] text-stone-200 shadow-2xl shadow-black/50"
      >
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-5 py-4 sm:px-8 sm:py-6">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-400">Academis</p>
            <h2 id="academis-library-title" className="mt-1 text-lg font-semibold text-stone-100">Prompt Library</h2>
            <p className="mt-1 text-xs text-stone-500">Shape the grading guidance used for each evaluation.</p>
          </div>
          <button
            type="button"
            onClick={() => setIsAcademisLibraryOpen(false)}
            disabled={isSavingAcademisLibrary || Boolean(deletingAcademisPresetId)}
            aria-label="Close prompt library"
            className="rounded-md border border-border p-2 text-stone-400 transition hover:border-amber-500/40 hover:text-amber-300 disabled:cursor-wait disabled:opacity-50"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5 sm:p-8">
          <div className="flex items-center gap-2 overflow-x-auto border-b border-border" role="tablist" aria-label="Prompt categories and saved prompts">
            <button
              type="button"
              role="tab"
              aria-selected={activeAcademisCategoryId === ALL_ACADEMIS_PROMPTS_CATEGORY_ID}
              aria-controls="academis-category-panel-all-prompts"
              onClick={() => {
                setActiveAcademisCategoryId(ALL_ACADEMIS_PROMPTS_CATEGORY_ID);
                setAcademisLibraryError(null);
              }}
              className={`shrink-0 border-b-2 px-3 py-2.5 text-xs transition ${activeAcademisCategoryId === ALL_ACADEMIS_PROMPTS_CATEGORY_ID ? "border-amber-400 text-amber-200" : "border-transparent text-stone-500 hover:text-stone-200"}`}
            >
              All saved prompts
            </button>
            {academisCategoryDrafts.map((category) => <div key={category.id} role="presentation" className="flex shrink-0 items-center">
              <button
                type="button"
                role="tab"
                aria-selected={activeAcademisCategoryId === category.id}
                aria-controls={`academis-category-panel-${category.id}`}
                onClick={() => {
                  setActiveAcademisCategoryId(category.id);
                  setAcademisLibraryError(null);
                }}
                className={`shrink-0 border-b-2 px-3 py-2.5 text-xs transition ${activeAcademisCategoryId === category.id ? "border-amber-400 text-amber-200" : "border-transparent text-stone-500 hover:text-stone-200"}`}
              >
                {category.label}
              </button>
            </div>)}
            <button
              type="button"
              disabled={isSavingAcademisLibrary || Boolean(deletingAcademisPresetId)}
              onClick={() => {
                const category = { id: `type-${crypto.randomUUID()}`, label: `New Type ${academisCategoryDrafts.length + 1}` };
                setAcademisCategoryDrafts((categories) => [...categories, category]);
                setActiveAcademisCategoryId(category.id);
                setAcademisLibraryError(null);
              }}
              className="shrink-0 px-3 py-2.5 text-xs text-amber-300 transition hover:text-amber-200"
            >
              + Type
            </button>
          </div>

          {(activeAcademisCategoryId === ALL_ACADEMIS_PROMPTS_CATEGORY_ID
            ? [{ id: ALL_ACADEMIS_PROMPTS_CATEGORY_ID, label: "All saved prompts" }]
            : academisCategoryDrafts.filter((category) => category.id === activeAcademisCategoryId)).map((category) => <div
            key={category.id}
            id={category.id === ALL_ACADEMIS_PROMPTS_CATEGORY_ID
              ? "academis-category-panel-all-prompts"
              : `academis-category-panel-${category.id}`}
            role="tabpanel"
            className="space-y-4"
          >
            {category.id === ALL_ACADEMIS_PROMPTS_CATEGORY_ID && <p className="text-xs leading-relaxed text-stone-500">Manage every saved prompt here. Unpinned prompts stay in your library and can be pinned again at any time.</p>}
            {category.id !== ALL_ACADEMIS_PROMPTS_CATEGORY_ID && <div className="flex flex-wrap items-end gap-3">
              <label className="block max-w-sm flex-1 text-xs text-stone-500">
                Category name
                <input
                  value={category.label}
                  maxLength={40}
                  disabled={isSavingAcademisLibrary || Boolean(deletingAcademisPresetId)}
                  onChange={(event) => setAcademisCategoryDrafts((categories) => categories.map((item) => item.id === category.id ? { ...item, label: event.target.value } : item))}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-stone-200 outline-none focus:border-amber-500/40 disabled:opacity-50"
                />
              </label>
              <button
                type="button"
                disabled={isSavingAcademisLibrary || Boolean(deletingAcademisPresetId)}
                onClick={() => deleteAcademisCategory(category.id)}
                className="rounded-md border border-red-500/25 px-3 py-2 text-xs text-red-300 transition hover:border-red-400/50 hover:bg-red-500/5 disabled:cursor-wait disabled:opacity-50"
              >
                Delete category…
              </button>
            </div>}

            {!academisPresetDrafts.some((preset) => (
              category.id === ALL_ACADEMIS_PROMPTS_CATEGORY_ID || preset.categoryId === category.id
            )) && <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-stone-500">
              No prompts in this category yet. Add a preset to get started.
            </p>}
            {academisPresetDrafts.filter((preset) => (
              category.id === ALL_ACADEMIS_PROMPTS_CATEGORY_ID || preset.categoryId === category.id
            )).map((preset) => <article
              key={preset.id}
              className="rounded-lg border border-border bg-background/70 p-4 sm:p-5"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">Evaluation prompt</p>
                  {category.id === ALL_ACADEMIS_PROMPTS_CATEGORY_ID && <p className="mt-1 text-[10px] text-stone-600">{academisCategoryDrafts.find((item) => item.id === preset.categoryId)?.label || "Uncategorized"}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-pressed={preset.isFavorite}
                    aria-label={preset.isFavorite ? `Unpin ${preset.label}` : `Pin ${preset.label}`}
                    title={preset.isFavorite ? "Unpin preset" : "Pin to sidebar"}
                    disabled={isSavingAcademisLibrary || Boolean(deletingAcademisPresetId)}
                    onClick={() => {
                      const willPin = !preset.isFavorite;
                      if (willPin && academisPresetDrafts.filter((item) => item.isFavorite).length >= 3) {
                        setAcademisLibraryError("Pin up to 3 presets for quick access in the sidebar.");
                        return;
                      }
                      setAcademisPresetDrafts((drafts) => drafts.map((item) => item.id === preset.id ? { ...item, isFavorite: !item.isFavorite } : item));
                      if (willPin) {
                        activateAcademisPreset(preset);
                      } else if (activeAcademisPresetId === preset.id) {
                        const fallback = academisPresetDrafts.find((item) => item.id !== preset.id && item.isFavorite)
                          || academisPresetDrafts.find((item) => item.id !== preset.id);
                        if (fallback) activateAcademisPreset(fallback);
                      }
                      setAcademisLibraryError(null);
                    }}
                    className={`rounded-md border p-2 transition disabled:cursor-wait disabled:opacity-50 ${preset.isFavorite ? "border-amber-500/40 bg-amber-500/10 text-amber-300" : "border-border text-stone-500 hover:border-amber-500/30 hover:text-amber-200"}`}
                  >
                    {preset.isFavorite ? <Star className="h-4 w-4 fill-current" aria-hidden="true" /> : <Pin className="h-4 w-4" aria-hidden="true" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteAcademisPreset(preset)}
                    aria-label={`Delete ${preset.label || "custom"} preset`}
                    disabled={isSavingAcademisLibrary || Boolean(deletingAcademisPresetId)}
                    title="Delete this prompt"
                    className="rounded-md px-2 py-1 text-[10px] text-stone-500 transition hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {deletingAcademisPresetId === preset.id ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </div>
              <label className="block text-xs text-stone-400">
                Title
                <input
                  value={preset.label}
                  maxLength={40}
                  disabled={isSavingAcademisLibrary || Boolean(deletingAcademisPresetId)}
                  onChange={(event) => setAcademisPresetDrafts((drafts) => drafts.map((item) => item.id === preset.id ? { ...item, label: event.target.value } : item))}
                  placeholder="Preset title"
                  className="mt-1.5 w-full rounded-md border border-border bg-[#0b0e13] px-3 py-2.5 text-sm text-stone-100 outline-none transition focus:border-amber-500/50 disabled:opacity-50"
                />
              </label>
              <label className="mt-3 block text-xs text-stone-400">
                Prompt
                <textarea
                  value={preset.prompt}
                  maxLength={MAX_INSTRUCTOR_PROMPT_LENGTH}
                  rows={4}
                  disabled={isSavingAcademisLibrary || Boolean(deletingAcademisPresetId)}
                  onChange={(event) => setAcademisPresetDrafts((drafts) => drafts.map((item) => item.id === preset.id ? { ...item, prompt: event.target.value } : item))}
                  placeholder="Describe the focus and style for this grading run..."
                  className="mt-1.5 w-full resize-y rounded-md border border-border bg-[#0b0e13] px-3 py-2.5 text-sm leading-relaxed text-stone-200 outline-none transition focus:border-amber-500/50 disabled:opacity-50"
                />
              </label>
              <label className="mt-4 block max-w-xl text-xs text-stone-400">
                Automatically use for task
                <select
                  value={preset.stageId && preset.taskId ? JSON.stringify([preset.stageId, preset.taskId]) : ""}
                  disabled={isSavingAcademisLibrary || deletingAcademisPresetId === preset.id}
                  onChange={(event) => {
                    const assignment = promptAssignmentOptions.find((option) => option.value === event.target.value);
                    setAcademisPresetDrafts((drafts) => drafts.map((item) => {
                      if (item.id === preset.id) {
                        return {
                          ...item,
                          stageId: assignment?.stageId,
                          taskId: assignment?.taskId,
                        };
                      }
                      if (assignment && item.stageId === assignment.stageId && item.taskId === assignment.taskId) {
                        return { ...item, stageId: undefined, taskId: undefined };
                      }
                      return item;
                    }));
                    setAcademisLibraryError(null);
                  }}
                  className="mt-1.5 w-full rounded-md border border-border bg-[#0b0e13] px-3 py-2.5 text-sm text-stone-200 outline-none focus:border-amber-500/50"
                >
                  <option value="">Default prompt (no task assignment)</option>
                  {promptAssignmentOptions.map((option) => <option key={option.value} value={option.value}>
                    {option.label}
                  </option>)}
                </select>
                <span className="mt-1 block text-[11px] leading-relaxed text-stone-500">
                  Selecting that task in the evaluator will automatically activate this prompt.
                </span>
              </label>
            </article>)}

            {category.id !== ALL_ACADEMIS_PROMPTS_CATEGORY_ID && <button
              type="button"
              disabled={isSavingAcademisLibrary || Boolean(deletingAcademisPresetId)}
              onClick={() => setAcademisPresetDrafts((drafts) => [...drafts, {
                id: `custom-${crypto.randomUUID()}`,
                label: "",
                prompt: "",
                categoryId: category.id,
                isFavorite: false,
              }])}
              className="rounded-md border border-dashed border-amber-500/30 px-3 py-2 text-xs text-amber-300 transition hover:border-amber-500/60 hover:bg-amber-500/5 disabled:cursor-wait disabled:opacity-50"
            >
              + Preset
            </button>}
          </div>)}
          {academisLibraryError && <p role="alert" className="text-xs text-red-300">{academisLibraryError}</p>}
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-5 py-4 sm:px-8">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsAcademisLibraryOpen(false)}
              disabled={isSavingAcademisLibrary || Boolean(deletingAcademisPresetId)}
              className="rounded-md px-3 py-2 text-xs text-stone-400 transition hover:text-stone-200"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void clearAcademisPrompts()}
              disabled={isSavingAcademisLibrary || Boolean(deletingAcademisPresetId) || isAcademisLibraryLoading || (!academisPresets.length && !academisPresetDrafts.length)}
              className="rounded-md border border-red-500/25 px-3 py-2 text-xs text-red-300 transition hover:border-red-400/50 hover:bg-red-500/5 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Delete all prompts
            </button>
          </div>
          <button
            type="button"
            onClick={() => void saveAcademisLibrary()}
            disabled={isSavingAcademisLibrary || Boolean(deletingAcademisPresetId) || isAcademisLibraryLoading}
            className="rounded-md bg-amber-500/20 px-4 py-2 text-xs font-semibold text-amber-200 transition hover:bg-amber-500/30 disabled:cursor-wait disabled:opacity-50"
          >
            {isSavingAcademisLibrary ? "Saving…" : "Save changes"}
          </button>
        </footer>
      </section>
    </div>}
    {isAcademisResultOpen && <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-black/80 p-3 backdrop-blur-md sm:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isAcademisLoading) setIsAcademisResultOpen(false);
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="academis-result-title"
        className="flex max-h-[96vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-amber-500/30 bg-[#10141b] text-stone-200 shadow-2xl shadow-black/60"
      >
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-5 py-4 sm:px-8 sm:py-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-300">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-400">Academis Evaluation</p>
              <h2 id="academis-result-title" className="mt-1 truncate text-lg font-semibold text-stone-100">
                {academisRequestContext?.taskTitle || "Preparing evaluation"}
              </h2>
              <p className="mt-0.5 truncate text-xs text-stone-500">
                {academisRequestContext?.stageTitle || activeStageTitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsAcademisResultOpen(false)}
            disabled={isAcademisLoading}
            aria-label="Close Academis evaluation"
            className="rounded-md border border-border p-2 text-stone-400 transition hover:border-amber-500/40 hover:text-amber-300 disabled:cursor-wait disabled:opacity-50"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
          {!isAcademisLoading && academisInsight && <button
            type="button"
            onClick={() => void generateAcademisInsight(true)}
            className="rounded-md border border-amber-500/30 px-3 py-2 text-xs font-medium text-amber-200 transition hover:bg-amber-500/10"
          >
            Run again
          </button>}
        </header>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5 sm:p-8">
          {academisRequestContext && <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-border bg-[#0b0e13] p-4 sm:p-5" aria-label="Task prompt being evaluated">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Task prompt</p>
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-stone-200">{stripMarkdown(academisRequestContext.taskPrompt)}</p>
            </section>
            <section className="rounded-xl border border-border bg-[#0b0e13] p-4 sm:p-5" aria-label="Student response being evaluated">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">Student response</p>
              <p className="max-h-52 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-relaxed text-stone-300">{stripMarkdown(academisRequestContext.studentResponse)}</p>
            </section>
          </div>}

          {academisRequestContext && <section className="rounded-lg border border-border bg-background/50 px-4 py-3">
            <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-stone-500">Evaluation instruction used</p>
            <p className="mt-1 text-[11px] font-medium text-stone-300">
              {academisPresets.find((preset) => preset.prompt === academisRequestContext.instructorPrompt)?.label || "Custom prompt"}
            </p>
            <p className="mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-stone-400">{academisRequestContext.instructorPrompt || "Use concise, evidence-based language-learning feedback."}</p>
          </section>}

          {academisInsight && <section className="rounded-lg border border-amber-500/25 bg-amber-500/[0.04] px-4 py-3">
            <label htmlFor="academis-rerun-prompt" className="text-[9px] font-semibold uppercase tracking-[0.12em] text-amber-400">
              Prompt for next run
            </label>
            <select
              id="academis-rerun-prompt"
              value={activeAcademisPresetId}
              onChange={(event) => {
                const preset = academisPresets.find((item) => item.id === event.target.value);
                if (preset) activateAcademisPreset(preset);
              }}
              className="mt-2 w-full rounded-md border border-border bg-[#0b0e13] px-3 py-2 text-xs text-stone-200 outline-none focus:border-amber-500/50"
            >
              {academisPresets.map((preset) => <option key={preset.id} value={preset.id}>
                {preset.label}{preset.isFavorite ? " · pinned" : ""}
              </option>)}
            </select>
            <p className="mt-2 max-h-24 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-stone-400">
              {academisPrompt.trim() || "No evaluation prompt selected."}
            </p>
          </section>}

          {isAcademisLoading && <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-center" role="status" aria-live="polite">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500/20 border-t-amber-400" aria-hidden="true" />
            <p className="text-sm font-medium text-stone-200">Academis is evaluating this response</p>
            <p className="text-xs text-stone-500">Scoring each rubric criterion and preparing instructor diagnostics…</p>
          </div>}

          {!isAcademisLoading && academisError && <div role="alert" className="rounded-lg border border-red-500/30 bg-red-950/30 p-4 text-sm text-red-200">
            {academisError}
          </div>}

          {!isAcademisLoading && academisInsight && <>
            <section aria-label="Granular rubric scores">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">Granular rubric breakdown</p>
                  <h3 className="mt-1 text-sm font-semibold text-stone-100">Criterion scores</h3>
                </div>
                <p className="text-xs text-stone-500">{Object.keys(academisInsight.result.criteria_scores).length} criteria identified</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {Object.entries(academisInsight.result.criteria_scores).map(([criterion, score]) => (
                  <article key={criterion} className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs leading-relaxed text-stone-300">{criterion}</p>
                      <label className="flex shrink-0 items-center gap-1 text-[10px] text-stone-500">
                        <input
                          type="number"
                          min={1}
                          max={9}
                          step={1}
                          value={score ?? ""}
                          onChange={(event) => {
                            const rawScore = event.target.value;
                            const nextScore = rawScore === "" ? null : Number(rawScore);
                            if (nextScore !== null
                              && (!Number.isInteger(nextScore) || nextScore < 1 || nextScore > 9)) return;
                            updateAcademisCriterionScore(criterion, nextScore);
                          }}
                          aria-label={`${criterion} score out of 9`}
                          className="w-14 rounded border border-border bg-background px-1.5 py-1 text-center text-lg font-semibold text-amber-300 outline-none focus:border-amber-500/40"
                        />
                        <span>/ 9</span>
                      </label>
                    </div>
                    {score !== null && <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-stone-800">
                      <div className="h-full rounded-full bg-amber-500" style={{ width: `${(score / 9) * 100}%` }} />
                    </div>}
                  </article>
                ))}
              </div>
              {Object.keys(academisInsight.result.criteria_scores).length === 0 && <p className="text-xs text-stone-500">This report contains no numeric criterion scores.</p>}
              <div className="mt-3 flex items-center justify-between rounded-lg border border-amber-500/35 bg-amber-500/10 px-4 py-3">
                <span className="text-xs font-medium text-amber-100">Mean of criterion scores</span>
                <span className="text-xl font-semibold text-amber-300">{calculateAcademisScoreMean(academisInsight.result.criteria_scores)?.toFixed(2) ?? "—"}<span className="text-xs text-amber-200/60"> / 9</span></span>
              </div>
            </section>

            <section>
              <div className="flex items-center gap-1 border-b border-border" role="tablist" aria-label="Academis evaluation results">
                <button
                  type="button"
                  role="tab"
                  id="academis-student-summary-tab"
                  aria-selected={academisResultTab === "student-summary"}
                  aria-controls="academis-student-summary-panel"
                  onClick={() => setAcademisResultTab("student-summary")}
                  className={`border-b-2 px-4 py-3 text-xs font-medium transition ${academisResultTab === "student-summary" ? "border-amber-400 text-amber-200" : "border-transparent text-stone-500 hover:text-stone-200"}`}
                >
                  Student Feedback
                </button>
                <button
                  type="button"
                  role="tab"
                  id="academis-instructor-diagnostic-tab"
                  aria-selected={academisResultTab === "instructor-diagnostic"}
                  aria-controls="academis-instructor-diagnostic-panel"
                  onClick={() => setAcademisResultTab("instructor-diagnostic")}
                  className={`border-b-2 px-4 py-3 text-xs font-medium transition ${academisResultTab === "instructor-diagnostic" ? "border-amber-400 text-amber-200" : "border-transparent text-stone-500 hover:text-stone-200"}`}
                >
                  Instructor Diagnostic
                </button>
              </div>

              {academisResultTab === "student-summary" && <div id="academis-student-summary-panel" role="tabpanel" aria-labelledby="academis-student-summary-tab" className="space-y-4 pt-5">
                {academisStudentPreviewTable
                  ? <AcademisReportTableView
                    headers={academisStudentPreviewTable.headers.slice(0, 3)}
                    rows={academisStudentPreviewTable.rows.map((row) => row.slice(0, 3))}
                    editableColumns={[1, 2]}
                    ariaLabel="Student-facing Academis feedback preview"
                    onCellChange={(rowIndex, columnIndex, value) => {
                      if (columnIndex === 1) {
                        updateAcademisPublishedTableCell(rowIndex, columnIndex, value);
                      } else if (columnIndex === 2) {
                        const rowKey = academisStudentPreviewTable.rows[rowIndex]?.[0] || String(rowIndex + 1);
                        updateAcademisStudentFeedback(rowKey, value);
                      }
                    }}
                  />
                  : <label className="block text-xs font-medium text-stone-300">
                    Legacy student feedback
                    <textarea
                      value={academisStudentSummary}
                      onChange={(event) => setAcademisStudentSummary(event.target.value)}
                      rows={5}
                      className="mt-2 w-full resize-y rounded-xl border border-border bg-[#0b0e13] p-4 text-sm leading-relaxed text-stone-100 outline-none transition focus:border-amber-500/40"
                      aria-label="Edit Academis student summary"
                    />
                  </label>}
                <p className="text-[11px] leading-relaxed text-stone-500">Student feedback includes only the first three columns. Instructor analysis is excluded from the published task feedback.</p>
                <button
                  type="button"
                  onClick={() => {
                    const { taskId } = academisInsight.context;
                    updateEvaluation({
                      taskFeedback: {
                        ...taskFeedback,
                        [taskId]: formatAcademisPublishedDraft(academisPublishedContentDraft),
                      },
                    });
                    setAcademisApplyNotice(`Feedback applied to ${academisInsight.context.taskTitle} only.`);
                  }}
                  className="rounded-md bg-amber-500/20 px-4 py-2.5 text-xs font-semibold text-amber-200 transition hover:bg-amber-500/30"
                >
                  Apply Feedback to This Task
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const { stageId, stageTitle, taskId } = academisInsight.context;
                    const targetStage = stages.find((stage) => stage.id === stageId);
                    const stageTaskIds = new Set(targetStage
                      ? targetStage.tasks.map((task) => task.id)
                      : [taskId]);
                    const submissionKeyPrefix = JSON.stringify([submissionId]).slice(0, -1) + ",";
                    const reportsByTask = new Map(
                      Object.entries(academisResultsByTask)
                        .filter(([cacheKey, report]) => cacheKey.startsWith(submissionKeyPrefix)
                          && report.context.stageId === stageId
                          && stageTaskIds.has(report.context.taskId))
                        .map(([, report]) => report)
                        .map((report) => [report.context.taskId, report]),
                    );
                    reportsByTask.set(taskId, {
                      ...academisInsight,
                      result: { ...academisInsight.result, student_summary: academisStudentSummary },
                    });
                    const stageReports = [...reportsByTask.values()];
                    const stageSummary = stageReports
                      .filter((report) => report.result.student_summary.trim())
                      .map((report) => `${report.context.taskTitle}: ${report.result.student_summary.trim()}`)
                      .join("\n\n");
                    updateEvaluation({
                      stageFeedback: { ...stageFeedback, [stageId]: stageSummary },
                    });
                    setAcademisApplyNotice(`Feedback from ${stageReports.length} evaluated task${stageReports.length === 1 ? "" : "s"} applied to ${stageTitle}.`);
                  }}
                  className="ml-2 rounded-md border border-amber-500/30 px-4 py-2.5 text-xs font-medium text-amber-200 transition hover:bg-amber-500/10"
                >
                  Apply Feedback to Stage Summary
                </button>
              </div>}

              {academisResultTab === "instructor-diagnostic" && <div id="academis-instructor-diagnostic-panel" role="tabpanel" aria-labelledby="academis-instructor-diagnostic-tab" className="space-y-5 pt-5">
                {academisInstructorOnlyTable && <section>
                  <h3 className="mb-3 text-sm font-semibold text-stone-100">Deep Diagnostic Analysis · instructor only</h3>
                  <AcademisReportTableView
                    headers={academisInstructorOnlyTable.headers}
                    rows={academisInstructorOnlyTable.rows}
                    ariaLabel="Instructor-only deep diagnostic analysis"
                  />
                </section>}
                <section className="rounded-xl border border-border bg-[#0b0e13] p-4 sm:p-5">
                  <h3 className="text-sm font-semibold text-stone-100">Teaching notes</h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-stone-300">{academisInsight.result.instructor_diagnostic.teaching_notes || "No additional teaching notes."}</p>
                </section>
                <section className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-4 sm:p-5">
                  <h3 className="text-sm font-semibold text-amber-200">Stage Summary / Diagnostic Overview</h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-stone-200">
                    {academisInsight.result.instructor_diagnostic.stage_summary_diagnostic || "Run Academis with stage task context to generate a cross-task overview."}
                  </p>
                </section>
                <section>
                  <h3 className="mb-3 text-sm font-semibold text-stone-100">Observed error patterns</h3>
                  {academisInsight.result.instructor_diagnostic.key_error_patterns.length
                    ? <div className="grid gap-3 md:grid-cols-2">
                      {academisInsight.result.instructor_diagnostic.key_error_patterns.map((pattern, index) => <article key={`${pattern.pattern}-${index}`} className="rounded-xl border border-border bg-[#0b0e13] p-4">
                        <p className="text-sm font-medium text-stone-200">{pattern.pattern}</p>
                        <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-stone-400">{pattern.example}</p>
                        <p className="mt-3 border-t border-border pt-2 text-xs leading-relaxed text-amber-200/80">Lesson adjustment: {pattern.lesson_adjustment}</p>
                      </article>)}
                    </div>
                    : <p className="rounded-lg border border-border bg-[#0b0e13] p-4 text-xs text-stone-500">No recurring error patterns were identified for this response.</p>}
                </section>
                <section>
                  <h3 className="mb-3 text-sm font-semibold text-stone-100">Targeted resource recommendations</h3>
                  {academisInsight.result.instructor_diagnostic.targeted_resources.length
                    ? <div className="grid gap-3 md:grid-cols-2">
                      {academisInsight.result.instructor_diagnostic.targeted_resources.map((resource, index) => <article key={`${resource.topic}-${index}`} className="rounded-xl border border-amber-500/15 bg-amber-500/[0.03] p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-400">{resource.topic}</p>
                        <p className="mt-1 text-sm font-medium text-stone-100">{resource.title}</p>
                        <p className="mt-2 text-xs leading-relaxed text-stone-400">{resource.reason}</p>
                      </article>)}
                    </div>
                    : <p className="rounded-lg border border-border bg-[#0b0e13] p-4 text-xs text-stone-500">No additional resources were recommended.</p>}
                </section>
                {academisInsight.report && <section className="space-y-4 rounded-xl border border-amber-500/30 bg-amber-500/[0.05] p-4 sm:p-5">
                  <div>
                    <h3 className="text-sm font-semibold text-amber-200">Review and publish to Stage 7</h3>
                    <p className="mt-1 text-xs leading-relaxed text-stone-400">The full report remains instructor-only. Edit the student-facing preview below; columns 4 and beyond are excluded from the default content.</p>
                  </div>
                  <details className="rounded-lg border border-border bg-[#0b0e13] p-3">
                    <summary className="cursor-pointer text-xs font-medium text-stone-200">Inspect full stored evaluation table</summary>
                    <div className="mt-3">
                      {academisReportTable
                        ? <AcademisReportTableView
                          headers={academisReportTable.headers}
                          rows={academisReportTable.rows}
                          ariaLabel="Full stored Academis evaluation table"
                        />
                        : <p className="text-xs leading-relaxed text-stone-400">This report has no Markdown table; no raw model output is displayed.</p>}
                    </div>
                  </details>
                  <section className="space-y-2">
                    <h4 className="text-xs font-medium text-stone-200">Student-facing feedback preview · columns 1–3</h4>
                    {academisPublishedContentDraft.format === "markdown_table"
                      ? <AcademisReportTableView
                        headers={academisPublishedContentDraft.headers}
                        rows={academisPublishedContentDraft.rows}
                        editableColumns={academisPublishedContentDraft.headers.map((_, index) => index)}
                        onCellChange={(rowIndex, columnIndex, value) => {
                          if (columnIndex === 2) {
                            const rowKey = academisPublishedContentDraft.rows[rowIndex]?.[0];
                            if (rowKey) updateAcademisStudentFeedback(rowKey, value);
                            else updateAcademisPublishedTableCell(rowIndex, columnIndex, value);
                          } else {
                            updateAcademisPublishedTableCell(rowIndex, columnIndex, value);
                          }
                          setAcademisPublishError(null);
                          setAcademisPublishNotice(null);
                        }}
                        ariaLabel="Editable student-facing Academis table preview"
                      />
                      : <textarea
                        value={academisPublishedContentDraft.content}
                        onChange={(event) => {
                          setAcademisPublishedContentDraft({ format: "text", content: event.target.value });
                          setAcademisPublishError(null);
                          setAcademisPublishNotice(null);
                        }}
                        rows={8}
                        className="w-full resize-y rounded-xl border border-border bg-[#0b0e13] p-4 text-sm leading-relaxed text-stone-100 outline-none transition focus:border-amber-500/40"
                        aria-label="Edit student-facing Academis feedback"
                      />}
                  </section>
                  {academisPublishError && <p role="alert" className="text-xs text-red-300">{academisPublishError}</p>}
                  {academisPublishNotice && <p role="status" className="text-xs text-emerald-300">{academisPublishNotice}</p>}
                  <button
                    type="button"
                    onClick={() => void publishAcademisReport()}
                    disabled={isPublishingAcademisReport || !hasPublishableAcademisContent(academisPublishedContentDraft)}
                    className="rounded-md bg-amber-500/20 px-4 py-2.5 text-xs font-semibold text-amber-200 transition hover:bg-amber-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isPublishingAcademisReport
                      ? "Publishing…"
                      : academisInsight.report.is_published
                        ? "Update Stage 7 Feedback"
                        : "Publish Feedback to Stage 7"}
                  </button>
                </section>}
                <p className="text-[10px] text-stone-500">
                  Instructor diagnostic and resource recommendations are {academisInsight.stored ? "saved to this submission" : "available for this session"} and shown in the selected task&apos;s stage notes.
                </p>
              </div>}
            </section>
          </>}
        </div>
      </section>
    </div>}
    {academisApplyNotice && <div
      role="status"
      aria-live="polite"
      className="fixed bottom-5 right-5 z-[150] max-w-sm rounded-md border border-amber-500/30 bg-[#11151b] px-4 py-3 text-xs text-amber-100 shadow-xl shadow-black/40"
    >
      {academisApplyNotice}
    </div>}
  </div>;
}

export default SubmissionEvaluator;
