import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSubmissionAnswers } from "../lib/submission-answers.ts";

test("normalizes wrapped answers and preserves nested, scalar, and array responses", () => {
  const result = normalizeSubmissionAnswers({
    answers: JSON.stringify({
      block_responses: {
        warmup: { reflection: { studentAnswer: "A thoughtful response." } },
      },
      quiz_selections: { question1: false },
      writing_answers: { draft: ["First sentence.", "Second sentence."] },
    }),
  });

  assert.equal(result.blockResponses?.["warmup:reflection"], "A thoughtful response.");
  assert.equal(result.quizSelections?.question1, "false");
  assert.equal(result.writing_responses?.draft, "First sentence.\nSecond sentence.");
});

test("retains malformed and scalar payloads instead of dropping student responses", () => {
  assert.equal(
    normalizeSubmissionAnswers("{not-json").blockResponses?.unmapped_submission_response,
    "{not-json",
  );
  assert.equal(
    normalizeSubmissionAnswers(0).blockResponses?.unmapped_submission_response,
    "0",
  );
  assert.equal(
    normalizeSubmissionAnswers(["first", "second"]).blockResponses?.unmapped_submission_response,
    "first\nsecond",
  );
});

test("preserves stage metadata and prioritizes audio URLs over transcripts", () => {
  const result = normalizeSubmissionAnswers({
    blockResponses: {
      task9: { stageId: "warmup", selected_option: "C" },
    },
    audioUploads: {
      speaking: { transcript: "Student transcript.", url: "https://example.test/voice.mp3" },
    },
  });

  assert.equal(result.blockResponses?.["warmup:task9"], "C");
  assert.equal(result.audioUploads?.speaking, "https://example.test/voice.mp3");
  assert.equal(result.audioTranscripts?.speaking, "Student transcript.");
});
