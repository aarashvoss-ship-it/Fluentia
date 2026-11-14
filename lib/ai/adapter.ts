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
              axis_score: { type: "string" },
              actionable_feedback: { type: "string" },
              strengths_weaknesses_diagnostics: { type: "string" },
            },
            required: [
              "index",
              "axis_score",
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

function isStandardEvaluationRow(value: unknown): value is StandardEvaluationRow {
  return isRecord(value)
    && Object.keys(value).length === 4
    && ["index", "axis_score", "actionable_feedback", "strengths_weaknesses_diagnostics"]
      .every((key) => key in value)
    && typeof value.index === "string"
    && value.index.trim().length > 0
    && value.index.length <= 40
    && typeof value.axis_score === "string"
    && value.axis_score.trim().length > 0
    && value.axis_score.length <= 300
    && typeof value.actionable_feedback === "string"
    && value.actionable_feedback.trim().length > 0
    && value.actionable_feedback.length <= 1200
    && typeof value.strengths_weaknesses_diagnostics === "string";
}

export function normalizeStandardEvaluationReport(response: unknown): StandardEvaluationReport | null {
  const extracted = extractAiResponseText(response);
  const parsed = parseStructuredJson(extracted.text || response);
  const report = getReportObject(parsed);
  if (!report || !Array.isArray(report.rows) || report.rows.length === 0 || report.rows.length > 40
    || !report.rows.every(isStandardEvaluationRow)
    || report.rows.some((row) => row.strengths_weaknesses_diagnostics.length > 2400)
    || new Set(report.rows.map((row) => row.index.trim())).size !== report.rows.length) return null;

  return {
    format: REPORT_FORMAT,
    rows: report.rows.map((row) => ({
      index: row.index.trim(),
      axis_score: row.axis_score.trim(),
      actionable_feedback: row.actionable_feedback.trim(),
      strengths_weaknesses_diagnostics: row.strengths_weaknesses_diagnostics.trim(),
    })),
  };
}

export const standardAiAdapter: AiAdapter = {
  extractText: extractAiResponseText,
  normalizeEvaluationReport: normalizeStandardEvaluationReport,
};
