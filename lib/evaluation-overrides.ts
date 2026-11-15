import type { UnifiedReportStage } from "@/types/lesson";

function normalizeAnswer(value: string) {
  return value.trim().toLowerCase().replace(/^[a-z]\s*[).]\s*/, "").trim();
}

export function applyTaskEvaluationOverrides(
  stages: UnifiedReportStage[],
  answerOverrides: Record<string, string> = {},
  modelAnswerOverrides: Record<string, string> = {},
): UnifiedReportStage[] {
  return stages.map((stage) => ({
    ...stage,
    tasks: stage.tasks.map((task) => {
      const hasAnswerOverride = Object.prototype.hasOwnProperty.call(answerOverrides, task.id);
      const hasModelAnswerOverride = Object.prototype.hasOwnProperty.call(modelAnswerOverrides, task.id);
      const studentAnswer = hasAnswerOverride ? answerOverrides[task.id] : task.studentAnswer;
      const modelAnswer = hasModelAnswerOverride ? modelAnswerOverrides[task.id] : task.modelAnswer;
      const shouldRecheck = (task.autoCheck || typeof task.isCorrect === "boolean")
        && (hasAnswerOverride || hasModelAnswerOverride);
      const isCorrect = shouldRecheck
        ? modelAnswer
          ?.split(/[\/|]/)
          .some((candidate) => normalizeAnswer(candidate) === normalizeAnswer(studentAnswer))
        : task.isCorrect;

      return {
        ...task,
        studentAnswer,
        studentTranscript: hasAnswerOverride && task.studentTranscript !== undefined
          ? studentAnswer
          : task.studentTranscript,
        modelAnswer,
        isCorrect,
      };
    }),
  }));
}
