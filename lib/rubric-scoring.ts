export type RubricScale = "standard-5" | "standard-10" | "ielts" | "percentage";

export interface RubricScaleOption {
  id: RubricScale;
  label: string;
  min: number;
  max: number;
  step: number;
}

export const RUBRIC_SCALE_OPTIONS: RubricScaleOption[] = [
  { id: "standard-5", label: "Standard · 1–5", min: 1, max: 5, step: 1 },
  { id: "standard-10", label: "Standard · 1–10", min: 1, max: 10, step: 1 },
  { id: "ielts", label: "IELTS · 1–9 (0.5 steps)", min: 1, max: 9, step: 0.5 },
  { id: "percentage", label: "Percentage · 0–100", min: 0, max: 100, step: 1 },
];

export const DEFAULT_RUBRIC_SCALE: RubricScale = "standard-5";

export function getRubricScale(id?: string): RubricScaleOption {
  return RUBRIC_SCALE_OPTIONS.find((option) => option.id === id)
    || RUBRIC_SCALE_OPTIONS[0];
}

export function normalizeRubricScore(score: number, scaleId?: string) {
  const scale = getRubricScale(scaleId);
  const boundedScore = Math.min(scale.max, Math.max(scale.min, score));
  const ratio = (boundedScore - scale.min) / (scale.max - scale.min);
  return scale.min === 0 ? ratio * 5 : 1 + ratio * 4;
}

export function displayRubricScore(score: number, scaleId?: string) {
  const scale = getRubricScale(scaleId);
  const normalizedMin = scale.min === 0 ? 0 : 1;
  const normalizedScore = Math.min(5, Math.max(normalizedMin, score));
  const ratio = scale.min === 0 ? normalizedScore / 5 : (normalizedScore - 1) / 4;
  return scale.min + ratio * (scale.max - scale.min);
}

export function convertRubricScore(score: number, fromScaleId: string | undefined, toScaleId: RubricScale) {
  const normalized = normalizeRubricScore(score, fromScaleId);
  const target = getRubricScale(toScaleId);
  const converted = displayRubricScore(normalized, toScaleId);
  return Math.min(target.max, Math.max(target.min, Math.round(converted / target.step) * target.step));
}

export function overallRubricScaleId(
  stageScores: Record<string, Record<string, number>>,
  stageRubricScales: Record<string, string>,
): RubricScale {
  const ratedStages = Object.entries(stageScores)
    .filter(([, scores]) => Object.values(scores).some((score) => Number.isFinite(score)));
  const stageIds = ratedStages.length
    ? ratedStages.map(([stageId]) => stageId)
    : Object.keys(stageRubricScales);
  const scaleIds = new Set(stageIds.map((stageId) =>
    getRubricScale(stageRubricScales[stageId]).id,
  ));
  return scaleIds.size === 1 ? [...scaleIds][0] : DEFAULT_RUBRIC_SCALE;
}

export function roundRubricScoreForScale(score: number, scaleId?: string) {
  switch (getRubricScale(scaleId).id) {
    case "ielts":
    case "standard-10":
      return Math.round((score + Number.EPSILON) * 2) / 2;
    case "standard-5":
      return Math.round((score + Number.EPSILON) * 4) / 4;
    case "percentage":
      return Math.round((score + Number.EPSILON) * 10) / 10;
  }
}

export interface OverallRubricResult {
  scaleId: RubricScale;
  criterionScores: Record<string, number>;
  displayCriterionScores: Record<string, number>;
  criterionStageCounts: Record<string, number>;
  totalScore: number;
  totalDenominator: number;
}

export function formatOverallRubricTotal(
  totalScore: number,
  scaleId?: string,
  denominator?: number,
) {
  const scale = getRubricScale(scaleId);
  const formattedScore = scale.id === "standard-5"
    ? totalScore.toFixed(2)
    : totalScore.toFixed(1);
  const label = scale.id === "ielts" ? "Overall Band Score" : "Total";
  const maxScore = denominator ?? (scale.id === "standard-5" ? 20 : scale.max);
  return `${label}: ${formattedScore} / ${maxScore}`;
}

export function aggregateOverallRubric({
  criterionIds,
  stageScores,
  stageRubricScales,
  reportCardScoreOverrides = {},
  fallbackScores = {},
}: {
  criterionIds: string[];
  stageScores: Record<string, Record<string, number>>;
  stageRubricScales: Record<string, string>;
  reportCardScoreOverrides?: Record<string, number>;
  fallbackScores?: Record<string, number>;
}): OverallRubricResult {
  const scaleId = overallRubricScaleId(stageScores, stageRubricScales);
  const scale = getRubricScale(scaleId);
  const criterionScores: Record<string, number> = {};
  const displayCriterionScores: Record<string, number> = {};
  const criterionStageCounts: Record<string, number> = {};
  const hasRecordedStageRatings = Object.values(stageScores)
    .some((scores) => Object.values(scores).some((score) => Number.isFinite(score)));
  const rawDisplayCriterionScores: Record<string, number> = {};

  for (const criterionId of criterionIds) {
    const stageRatings = Object.entries(stageScores)
      .map(([stageId, scores]) => {
        const score = scores[criterionId];
        return typeof score === "number" && Number.isFinite(score)
          ? normalizeRubricScore(score, stageRubricScales[stageId])
          : undefined;
      })
      .filter((score): score is number => score !== undefined);
    const normalizedAverage = stageRatings.length
      ? stageRatings.reduce((sum, score) => sum + score, 0) / stageRatings.length
      : undefined;
    const normalizedScore = typeof reportCardScoreOverrides[criterionId] === "number"
      ? reportCardScoreOverrides[criterionId]
      : normalizedAverage ?? (hasRecordedStageRatings ? undefined : fallbackScores[criterionId]);

    criterionStageCounts[criterionId] = stageRatings.length;
    if (typeof normalizedScore !== "number" || !Number.isFinite(normalizedScore)) continue;

    criterionScores[criterionId] = normalizedScore;
    rawDisplayCriterionScores[criterionId] = displayRubricScore(normalizedScore, scaleId);
    displayCriterionScores[criterionId] = roundRubricScore(rawDisplayCriterionScores[criterionId]);
  }

  const scoredCriteria = criterionIds
    .map((criterionId) => rawDisplayCriterionScores[criterionId])
    .filter((score): score is number => typeof score === "number");
  const unroundedTotal = scaleId === "standard-5"
    ? scoredCriteria.reduce((sum, score) => sum + score, 0)
    : scoredCriteria.length
      ? scoredCriteria.reduce((sum, score) => sum + score, 0) / scoredCriteria.length
      : 0;

  return {
    scaleId,
    criterionScores,
    displayCriterionScores,
    criterionStageCounts,
    totalScore: roundRubricScoreForScale(unroundedTotal, scaleId),
    totalDenominator: scaleId === "standard-5" ? criterionIds.length * scale.max : scale.max,
  };
}

export function roundRubricScore(score: number) {
  return Math.round((score + Number.EPSILON) * 10) / 10;
}

export function formatRubricScore(score: number) {
  const rounded = roundRubricScore(score);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
