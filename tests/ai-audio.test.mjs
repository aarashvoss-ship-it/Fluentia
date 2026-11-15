import assert from "node:assert/strict";
import test from "node:test";
import {
  createAiInputAudioPart,
  getAiAudioFormat,
  getAudioTranscriptionEndpoint,
} from "../lib/ai/audio.ts";
import { buildAiChatCompletionBody } from "../lib/ai/config.ts";

test("builds input-audio parts with formats derived from the uploaded MIME type", () => {
  assert.deepEqual(createAiInputAudioPart("YWJj", "audio/wav"), {
    type: "input_audio",
    input_audio: { data: "YWJj", format: "wav" },
  });
  assert.equal(getAiAudioFormat("audio/webm;codecs=opus"), "webm");
  assert.equal(createAiInputAudioPart("YWJj", "application/octet-stream"), null);

  const audioPart = createAiInputAudioPart("YWJj", "audio/mp3");
  const request = buildAiChatCompletionBody({
    model: "openai/gpt-4o-audio-preview",
    vendor: "openai",
    structuredOutputMode: "json_schema",
    endpoint: "https://gateway.test/chat/completions",
    apiKeyEnv: "PAASTA_AI_API_KEY",
    tokenLimitParameter: "max_tokens",
  }, [{ role: "user", content: [{ type: "text", text: "Evaluate this audio." }, audioPart] }]);
  assert.deepEqual(request.messages[0].content[1], audioPart);
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
