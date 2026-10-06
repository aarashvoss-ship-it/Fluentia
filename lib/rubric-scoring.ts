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

export function roundRubricScore(score: number) {
  return Math.round((score + Number.EPSILON) * 10) / 10;
}

export function formatRubricScore(score: number) {
  const rounded = roundRubricScore(score);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
