export const STANDARD_EVALUATION_HEADERS = [
  "Row / Index",
  "Evaluation Axis & Percentage Score (0–100%)",
  "Actionable Feedback for the Student",
  "Deep Diagnostic Analysis for Instructors and the Lesson Builder (hidden from the student view)",
] as const;

export interface StandardEvaluationRow {
  index: string;
  axis: string;
  score: number;
  actionable_feedback: string;
  strengths_weaknesses_diagnostics: string;
}

export interface StandardEvaluationReport {
  format: "standard_evaluation_report_v1";
  rows: StandardEvaluationRow[];
}

export interface StandardInstructorDiagnostic {
  stage_summary_diagnostic: string;
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
}

export interface StandardEvaluationResponse extends StandardEvaluationReport {
  instructor_diagnostic: StandardInstructorDiagnostic;
}

export interface ExtractedAiResponse {
  text: string;
  detail?: string;
}

export interface AiAdapter {
  extractText(response: unknown): ExtractedAiResponse;
  normalizeEvaluationReport(response: unknown): StandardEvaluationReport | null;
}
