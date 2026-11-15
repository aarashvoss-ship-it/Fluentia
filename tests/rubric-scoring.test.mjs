import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateOverallRubric,
  aggregateTaskRubricScoresForStage,
  calculateStageOverallScore,
} from "../lib/rubric-scoring.ts";
import { applyTaskEvaluationOverrides } from "../lib/evaluation-overrides.ts";

test("aggregates only the stage's task scores and calculates its overall rubric score", () => {
  const stageScores = aggregateTaskRubricScoresForStage(
    ["task-1", "task-2"],
    {
      "task-1": { task: 80, grammar: 60 },
      "task-2": { task: 100, grammar: 80 },
      unrelated: { task: 0 },
    },
    {},
    "percentage",
  );

  assert.deepEqual(stageScores, { task: 90, grammar: 70 });
  assert.equal(calculateStageOverallScore(stageScores, ["task", "grammar"], "percentage"), 80);
  assert.equal(aggregateOverallRubric({
    criterionIds: ["task", "grammar"],
    stageScores: { lesson: stageScores },
    stageRubricScales: { lesson: "percentage" },
  }).totalScore, 80);
});

test("applies answer overrides and rechecks objective correctness without mutating source tasks", () => {
  const stages = [{
    id: "lesson",
    tasks: [{
      id: "task-1",
      studentAnswer: "False",
      studentTranscript: "False",
      modelAnswer: "True",
      isCorrect: false,
      autoCheck: true,
    }],
  }];
  const effectiveStages = applyTaskEvaluationOverrides(stages, { "task-1": "True" });

  assert.equal(effectiveStages[0].tasks[0].studentAnswer, "True");
  assert.equal(effectiveStages[0].tasks[0].isCorrect, true);
  assert.equal(stages[0].tasks[0].studentAnswer, "False");
  assert.equal(stages[0].tasks[0].isCorrect, false);
});
