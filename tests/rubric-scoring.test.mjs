import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateTaskRubricScoresForStage,
  calculateStageOverallScore,
} from "../lib/rubric-scoring.ts";

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
});
