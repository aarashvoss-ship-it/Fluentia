import assert from "node:assert/strict";
import test from "node:test";
import {
  createAiInputAudioPart,
  getAiAudioFormat,
  getAudioTranscriptionEndpoint,
} from "../lib/ai/audio.ts";
import {
  buildGoogleAiStudioRequestBody,
  getRetryAfterText,
} from "../lib/ai/google-adapter.ts";
import { ACADEMIS_MODEL_OPTIONS } from "../lib/ai/models.ts";

test("builds input-audio parts with formats derived from the uploaded MIME type", () => {
  assert.deepEqual(createAiInputAudioPart("YWJj", "audio/wav"), {
    type: "input_audio",
    input_audio: { data: "YWJj", format: "wav" },
  });
  assert.equal(getAiAudioFormat("audio/webm;codecs=opus"), "webm");
  assert.equal(createAiInputAudioPart("YWJj", "application/octet-stream"), null);

});

test("derives or accepts a dedicated PaasTA transcription endpoint", () => {
  assert.equal(
    getAudioTranscriptionEndpoint("https://gateway.test/api/ai/v1/chat/completions"),
    "https://gateway.test/api/ai/v1/audio/transcriptions",
  );
  assert.equal(
    getAudioTranscriptionEndpoint(
      "https://gateway.test/api/ai/v1/chat/completions",
      "https://stt.test/v1/audio/transcriptions",
    ),
    "https://stt.test/v1/audio/transcriptions",
  );
  assert.throws(
    () => getAudioTranscriptionEndpoint("https://gateway.test/v1/completions"),
    /ACADEMIS_STT_URL/,
  );
});

test("builds a native Gemini audio request and formats quota reset headers", () => {
  const body = buildGoogleAiStudioRequestBody({
    systemPrompt: "Follow the evaluation rubric.",
    userPrompt: "Evaluate the recording.",
    audio: { mimeType: "audio/webm;codecs=opus", data: "YWJj" },
    responseSchema: {
      type: "object",
      properties: { score: { type: "integer" } },
      required: ["score"],
    },
  });

  assert.deepEqual(body.contents[0].parts[1], {
    inlineData: { mimeType: "audio/webm", data: "YWJj" },
  });
  assert.equal(body.generationConfig.responseSchema.type, "OBJECT");
  assert.equal(getRetryAfterText(new Headers({ "retry-after": "3600" })), "about 1 hour");
  assert.equal(
    getRetryAfterText(new Headers({
      "retry-after": "invalid",
      "x-ratelimit-reset": String(Date.now() / 1000 + 90),
    })),
    "about 2 minutes",
  );
  assert.equal(
    getRetryAfterText(
      new Headers({ "x-ratelimit-reset": String(1_750_000_000_000 + 90_000) }),
      1_750_000_000_000,
    ),
    "about 2 minutes",
  );
});

test("provides model options for the supported vendor and tier combinations", () => {
  assert.deepEqual(
    ACADEMIS_MODEL_OPTIONS.map(({ model, tier }) => [model, tier]),
    [
      ["google/gemini-2.5-flash", "free"],
      ["google/gemini-2.5-flash", "paid"],
      ["google/gemini-3-flash-preview", "paid"],
      ["openai/gpt-5", "paid"],
      ["openai/gpt-5-mini", "paid"],
    ],
  );
});
