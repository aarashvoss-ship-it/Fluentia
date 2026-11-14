import {
  type AiAdapter,
  type ExtractedAiResponse,
  type StandardEvaluationReport,
  type StandardEvaluationRow,
} from "@/lib/ai/types";

const REPORT_FORMAT = "standard_evaluation_report_v1";

export const STANDARD_EVALUATION_RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "academis_standard_evaluation",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        format: { type: "string", enum: [REPORT_FORMAT] },
        rows: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              index: { type: "string" },
              axis: { type: "string" },
              score: { type: "number", minimum: 1, maximum: 9 },
              actionable_feedback: { type: "string" },
              strengths_weaknesses_diagnostics: { type: "string" },
            },
            required: [
              "index",
              "axis",
              "score",
              "actionable_feedback",
              "strengths_weaknesses_diagnostics",
            ],
          },
        },
        instructor_diagnostic: {
          type: "object",
          additionalProperties: false,
          properties: {
            stage_summary_diagnostic: { type: "string" },
            key_error_patterns: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  pattern: { type: "string" },
                  example: { type: "string" },
                  lesson_adjustment: { type: "string" },
                },
                required: ["pattern", "example", "lesson_adjustment"],
              },
            },
            targeted_resources: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  topic: { type: "string" },
                  title: { type: "string" },
                  reason: { type: "string" },
                },
                required: ["topic", "title", "reason"],
              },
            },
            teaching_notes: { type: "string" },
          },
          required: [
            "stage_summary_diagnostic",
            "key_error_patterns",
            "targeted_resources",
            "teaching_notes",
          ],
        },
      },
      required: ["format", "rows", "instructor_diagnostic"],
    },
  },
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function extractTextContent(value: unknown, depth = 0): string {
  if (depth > 8) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map((part) => extractTextContent(part, depth + 1)).filter(Boolean).join("\n");
  }
  if (!isRecord(value)) return "";
  for (const key of ["content", "text", "output_text", "value"]) {
    if (value[key] === undefined) continue;
    const text = extractTextContent(value[key], depth + 1);
    if (text.trim()) return text;
  }
  for (const key of [
    "choices",
    "candidates",
    "candidate",
    "parts",
    "message",
    "delta",
    "output",
    "data",
    "response",
    "result",
    "completion",
    "body",
    "parsed",
  ]) {
    if (value[key] === undefined) continue;
    const text = extractTextContent(value[key], depth + 1);
    if (text.trim()) return text;
  }
  return "";
}

export function extractAiResponseText(response: unknown, depth = 0): ExtractedAiResponse {
  if (typeof response === "string") return { text: response };
  if (depth > 3 || !isRecord(response)) return { text: "" };
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return { text: response.output_text };
  }

  const choice = Array.isArray(response.choices) && isRecord(response.choices[0])
    ? response.choices[0]
    : null;
  const message = choice && isRecord(choice.message)
    ? choice.message
    : isRecord(response.message) ? response.message : null;
  const messageText = message ? extractTextContent(message.content) : "";
  if (messageText.trim()) return { text: messageText };
  if (message && message.content !== null && typeof message.content === "object") {
    try {
      return { text: JSON.stringify(message.content) };
    } catch {
      return { text: "" };
    }
  }
  if (choice && typeof choice.text === "string" && choice.text.trim()) {
    return { text: choice.text };
  }
  if (message && message.parsed !== undefined) {
    try {
      return { text: JSON.stringify(message.parsed) };
    } catch {
      return { text: "" };
    }
  }

  const directText = extractTextContent(response.output)
    || extractTextContent(response.content);
  if (directText.trim()) return { text: directText };

  const detail = message && typeof message.refusal === "string"
    ? message.refusal
    : choice && typeof choice.finish_reason === "string"
      ? `Completion finished with reason "${choice.finish_reason}" and no text content.`
      : undefined;
  const nestedText = extractTextContent(response);
  if (nestedText.trim()) return { text: nestedText };
  for (const key of ["data", "response", "result", "completion"]) {
    if (response[key] === undefined || response[key] === response) continue;
    const nested = extractAiResponseText(response[key], depth + 1);
    if (nested.text.trim()) return nested;
    if (!detail && nested.detail) return nested;
  }
  return { text: "", ...(detail ? { detail } : {}) };
}

function parseStructuredJson(value: unknown): unknown | null {
  if (isRecord(value)) return value;
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function getReportObject(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  if (value.format === REPORT_FORMAT && Array.isArray(value.rows)) return value;
  if (isRecord(value.report) && value.report.format === REPORT_FORMAT) return value.report;
  return null;
}

function normalizeStandardEvaluationRow(value: unknown): StandardEvaluationRow | null {
  if (!isRecord(value)
    || typeof value.index !== "string"
    || !value.index.trim()
    || value.index.length > 40
    || typeof value.actionable_feedback !== "string"
    || !value.actionable_feedback.trim()
    || value.actionable_feedback.length > 1200
    || typeof value.strengths_weaknesses_diagnostics !== "string"
    || value.strengths_weaknesses_diagnostics.length > 2400) return null;

  const isCurrentFormat = Object.keys(value).length === 5
    && ["index", "axis", "score", "actionable_feedback", "strengths_weaknesses_diagnostics"]
      .every((key) => key in value);
  const isLegacyFormat = Object.keys(value).length === 4
    && ["index", "axis_score", "actionable_feedback", "strengths_weaknesses_diagnostics"]
      .every((key) => key in value);
  let axis: string;
  let score: number;
  if (isCurrentFormat && typeof value.axis === "string") {
    axis = value.axis.trim()
      .replace(/^\s*[+-]\s*/, "")
      .replace(/\s+[1-9](?:\.\d+)?\s*[+-]\s*$/, "")
      .replace(/\s*\(\s*[1-9](?:\.\d+)?\s*\/\s*9\s*\)\s*$/, "")
      .replace(/\s*[+-]\s*$/, "")
      .trim();
    score = typeof value.score === "number"
      ? value.score
      : typeof value.score === "string" && value.score.trim() ? Number(value.score) : NaN;
  } else if (isLegacyFormat && typeof value.axis_score === "string") {
    const legacyAxis = value.axis_score.trim();
    const scoreMatch = legacyAxis.match(
      /\b([1-9](?:\.\d+)?)\s*(?:\/\s*9|out\s+of\s+9)\b/i,
    ) || legacyAxis.match(/(?:^|\s)([1-9](?:\.\d+)?)\s*[+-]?\s*$/);
    if (!scoreMatch) return null;
    score = Number(scoreMatch[1]);
    axis = legacyAxis
      .replace(/\(\s*[1-9](?:\.\d+)?\s*(?:\/\s*9|out\s+of\s+9)\s*\)/i, " ")
      .replace(/\b[1-9](?:\.\d+)?\s*(?:\/\s*9|out\s+of\s+9)\b/i, " ")
      .replace(/\s+[1-9](?:\.\d+)?\s*[+-]?\s*$/, "")
      .replace(/\s*[+-]\s*$/, "")
      .replace(/\s+/g, " ")
      .trim();
  } else {
    return null;
  }

  if (!axis || axis.length > 300 || !Number.isFinite(score) || score < 1 || score > 9) return null;
  return {
    index: value.index.trim(),
    axis,
    score,
    actionable_feedback: value.actionable_feedback.trim(),
    strengths_weaknesses_diagnostics: value.strengths_weaknesses_diagnostics.trim(),
  };
}

export function normalizeStandardEvaluationReport(response: unknown): StandardEvaluationReport | null {
  const extracted = extractAiResponseText(response);
  const parsed = parseStructuredJson(extracted.text || response);
  const report = getReportObject(parsed);
  if (!report || !Array.isArray(report.rows) || report.rows.length === 0 || report.rows.length > 40) return null;
  const normalizedRows = report.rows.map(normalizeStandardEvaluationRow);
  if (normalizedRows.some((row) => row === null)) return null;
  const rows = normalizedRows.filter((row): row is StandardEvaluationRow => row !== null);
  if (new Set(rows.map((row) => row.index)).size !== rows.length) return null;

  return {
    format: REPORT_FORMAT,
    rows,
  };
}

export const standardAiAdapter: AiAdapter = {
  extractText: extractAiResponseText,
  normalizeEvaluationReport: normalizeStandardEvaluationReport,
};
