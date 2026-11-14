import type { StudentSubmission } from "@/types/lesson";

type SubmissionAnswerData = Partial<StudentSubmission>;

const RESPONSE_VALUE_KEYS = [
  "answer",
  "response",
  "value",
  "text",
  "studentAnswer",
  "student_answer",
  "studentResponse",
  "student_response",
  "userAnswer",
  "user_answer",
  "userResponse",
  "user_response",
  "responseText",
  "response_text",
  "answerText",
  "answer_text",
  "writtenResponse",
  "written_response",
  "submittedAnswer",
  "submitted_answer",
  "selectedOption",
  "selected_option",
  "selectedAnswers",
  "selected_answers",
  "selectedChoice",
  "selected_choice",
  "selectedValue",
  "selected_value",
  "transcript",
  "transcription",
  "studentTranscript",
  "student_transcript",
  "url",
  "audioUrl",
  "audio_url",
  "upload_url",
  "recording_url",
  "audio_recording_url",
  "fileUrl",
  "file_url",
] as const;

const AUDIO_UPLOAD_VALUE_KEYS = [
  "url",
  "audioUrl",
  "audio_url",
  "upload_url",
  "recording_url",
  "audio_recording_url",
  "fileUrl",
  "file_url",
] as const;

const METADATA_KEYS = new Set([
  "id",
  "status",
  "progress",
  "submittedat",
  "submitted_at",
  "updatedat",
  "updated_at",
  "lessonid",
  "lesson_id",
  "studentid",
  "student_id",
  "submissionid",
  "submission_id",
  "stageid",
  "stage_id",
  "stage",
  "step",
  "stepindex",
  "step_index",
  "stageindex",
  "stage_index",
  "taskid",
  "task_id",
  "blockid",
  "block_id",
  "questionid",
  "question_id",
]);

const KNOWN_ANSWER_FIELDS = new Set([
  "listeninganswers",
  "listening_answers",
  "readinganswers",
  "reading_answers",
  "writingtext",
  "writing_text",
  "writing_responses",
  "writingresponses",
  "writinganswers",
  "writing_answers",
  "blockresponses",
  "block_responses",
  "quizselections",
  "quiz_selections",
  "audio_uploads",
  "audiouploads",
  "speakingaudiourl",
  "speaking_audio_url",
  "student_transcript",
  "studenttranscript",
  "transcription",
  "transcript",
  "audiotranscripts",
  "audio_transcripts",
  "studenttranscripts",
  "student_transcripts",
  "transcripts",
  "responses",
  "taskresponses",
  "task_responses",
  "stageresponses",
  "stage_responses",
  "answersbytask",
  "answers_by_task",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function mappingWarning(context: string, detail: string, metadata?: Record<string, unknown>) {
  console.warn("[submission-data-mapper] Could not map submission data cleanly.", {
    context,
    detail,
    ...metadata,
  });
}

function serializeValue(value: unknown, context: string, detail: string): string | undefined {
  try {
    return JSON.stringify(value);
  } catch (error) {
    mappingWarning(context, detail, { error: error instanceof Error ? error.message : String(error) });
    return undefined;
  }
}

function extractResponseText(
  value: unknown,
  depth = 0,
  valueKeys: readonly string[] = RESPONSE_VALUE_KEYS,
): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null || value === undefined || depth > 5) return undefined;
  if (Array.isArray(value)) {
    const items = value
      .map((item) => extractResponseText(item, depth + 1, valueKeys))
      .filter((item): item is string => item !== undefined && item.length > 0);
    return items.length ? items.join("\n") : serializeValue(value, "response", "Could not serialize an answer array.");
  }
  if (!isRecord(value)) return undefined;
  let emptyCandidate: string | undefined;
  for (const key of valueKeys) {
    if (value[key] !== undefined && value[key] !== value) {
      const text = extractResponseText(value[key], depth + 1, valueKeys);
      if (text !== undefined && text.length > 0) return text;
      if (text === "") emptyCandidate = text;
    }
  }
  if (emptyCandidate !== undefined) return emptyCandidate;
  return serializeValue(value, "response", "Could not serialize an unrecognized answer object.");
}

function hasResponseValue(value: Record<string, unknown>) {
  return RESPONSE_VALUE_KEYS.some((key) => value[key] !== undefined);
}

function metadataStageKey(value: Record<string, unknown>) {
  const stage = value.stage_id ?? value.stageId ?? value.stage ?? value.step;
  const stageIndex = value.stage_index ?? value.stageIndex ?? value.step_index ?? value.stepIndex;
  if (typeof stage === "string" && stage.trim()) return stage.trim();
  if (typeof stage === "number" && Number.isInteger(stage)) return `stage_${stage}`;
  if (typeof stageIndex === "number" && Number.isInteger(stageIndex)) return `step_${stageIndex}`;
  return undefined;
}

function normalizeResponseMap(
  value: unknown,
  context: string,
  valueKeys: readonly string[] = RESPONSE_VALUE_KEYS,
): Record<string, string> {
  const responses: Record<string, string> = {};

  const addResponse = (key: string, response: unknown) => {
    if (response === null || response === undefined) return;
    const answer = extractResponseText(response, 0, valueKeys);
    if (answer === undefined) {
      mappingWarning(context, "A non-empty response value could not be converted to displayable text.", {
        responseKey: key,
        responseType: Array.isArray(response) ? "array" : typeof response,
      });
      return;
    }
    responses[key || "unmapped_response"] = answer;
  };

  const visit = (item: unknown, prefix: string) => {
    if (item === null || item === undefined) return;
    if (Array.isArray(item)) {
      if (prefix) {
        addResponse(prefix, item);
        return;
      }
      item.forEach((entry, index) => {
        const entryRecord = isRecord(entry) ? entry : undefined;
        const explicitKey = entryRecord
          ? [entryRecord.task_id, entryRecord.taskId, entryRecord.block_id, entryRecord.blockId, entryRecord.question_id, entryRecord.questionId, entryRecord.id]
            .find((candidate): candidate is string => typeof candidate === "string" && candidate.trim().length > 0)
          : undefined;
        const key = [metadataStageKey(entryRecord || {}), prefix, explicitKey || `response_${index + 1}`]
          .filter((part): part is string => Boolean(part))
          .join(":");
        addResponse(key, entry);
      });
      return;
    }
    if (!isRecord(item)) {
      if (prefix) addResponse(prefix, item);
      else mappingWarning(context, "A response value has no task or stage key.", { responseType: typeof item });
      return;
    }
    if (hasResponseValue(item)) {
      const explicitKey = [
        item.task_id, item.taskId, item.block_id, item.blockId, item.question_id, item.questionId, item.id,
      ].find((candidate): candidate is string => typeof candidate === "string" && candidate.trim().length > 0);
      const key = [metadataStageKey(item), prefix, explicitKey && !prefix ? explicitKey : undefined]
        .filter((part): part is string => Boolean(part))
        .join(":");
      addResponse(key || "unmapped_response", item);
      return;
    }
    Object.entries(item).forEach(([key, response]) => {
      if (METADATA_KEYS.has(key.toLowerCase())) return;
      visit(response, prefix ? `${prefix}:${key}` : key);
    });
  };

  visit(value, "");
  return responses;
}

function pick(value: Record<string, unknown>, ...keys: string[]) {
  return keys.map((key) => value[key]).find((candidate) => candidate !== undefined);
}

function firstString(value: Record<string, unknown>, ...keys: string[]) {
  const candidate = pick(value, ...keys);
  return typeof candidate === "string" ? candidate : undefined;
}

export function normalizeSubmissionAnswers(value: unknown, context = "submission"): SubmissionAnswerData {
  let answers = value;
  if (typeof answers === "string") {
    const rawAnswers = answers;
    try {
      answers = JSON.parse(answers) as unknown;
    } catch {
      mappingWarning(context, "Stored answers were not valid JSON; preserving the raw response.");
      return { writingText: "", blockResponses: { unmapped_submission_response: rawAnswers } };
    }
  }
  if (typeof answers === "string" || typeof answers === "number" || typeof answers === "boolean") {
    mappingWarning(context, "Stored answers used a scalar shape; preserving it as a response.");
    return { writingText: "", blockResponses: { unmapped_submission_response: String(answers) } };
  }

  for (let depth = 0; depth < 5 && isRecord(answers); depth += 1) {
    if (Object.keys(answers).some((key) => KNOWN_ANSWER_FIELDS.has(key.toLowerCase()))) break;
    const wrapped = [answers.submission, answers.answers, answers.response, answers.data]
      .find((candidate) => isRecord(candidate) || typeof candidate === "string");
    if (wrapped === undefined) break;
    answers = wrapped;
    if (typeof answers === "string") {
      const rawAnswers = answers;
      try {
        answers = JSON.parse(answers) as unknown;
      } catch {
        mappingWarning(context, "A wrapped answer was not valid JSON; preserving the raw response.");
        return { writingText: "", blockResponses: { unmapped_submission_response: rawAnswers } };
      }
    }
  }

  if (!isRecord(answers)) {
    if (answers === null || answers === undefined) return {};
    const rawResponse = extractResponseText(answers);
    if (rawResponse === undefined) {
      mappingWarning(context, "Submission answer payload had an unsupported shape.", {
        payloadType: Array.isArray(answers) ? "array" : typeof answers,
      });
      return {};
    }
    mappingWarning(context, "Submission answer payload was not an object; preserving it as a response.", {
      payloadType: Array.isArray(answers) ? "array" : typeof answers,
    });
    return { writingText: "", blockResponses: { unmapped_submission_response: rawResponse } };
  }

  const hasKnownFields = Object.keys(answers).some((key) => KNOWN_ANSWER_FIELDS.has(key.toLowerCase()));
  const directResponse = hasResponseValue(answers) && !hasKnownFields
    ? normalizeResponseMap({ unmapped_response: answers }, context)
    : normalizeResponseMap(
      Object.fromEntries(Object.entries(answers).filter(([key]) =>
        !KNOWN_ANSWER_FIELDS.has(key.toLowerCase()) && !METADATA_KEYS.has(key.toLowerCase())
        && !["status", "progress"].includes(key.toLowerCase()),
      )),
      context,
    );
  const genericResponses = normalizeResponseMap(
    pick(answers, "responses", "taskResponses", "task_responses", "stageResponses", "stage_responses", "answersByTask", "answers_by_task"),
    context,
  );
  const audioUploadPayload = pick(answers, "audioUploads", "audio_uploads");
  const audioUploadTranscripts = normalizeResponseMap(audioUploadPayload, context);
  const blockResponses = {
    ...directResponse,
    ...genericResponses,
    ...normalizeResponseMap(pick(answers, "blockResponses", "block_responses"), context),
  };

  return {
    listeningAnswers: normalizeResponseMap(pick(answers, "listeningAnswers", "listening_answers"), context),
    readingAnswers: normalizeResponseMap(pick(answers, "readingAnswers", "reading_answers"), context),
    writingText: extractResponseText(pick(answers, "writingText", "writing_text")) || "",
    writing_responses: normalizeResponseMap(pick(answers, "writing_responses", "writingResponses", "writingAnswers", "writing_answers"), context),
    speakingAudioUrl: firstString(answers, "speakingAudioUrl", "speaking_audio_url"),
    student_transcript: firstString(answers, "student_transcript", "studentTranscript"),
    transcription: firstString(answers, "transcription"),
    transcript: firstString(answers, "transcript"),
    audioTranscripts: {
      ...audioUploadTranscripts,
      ...normalizeResponseMap(pick(answers, "audioTranscripts", "audio_transcripts"), context),
    },
    studentTranscripts: normalizeResponseMap(pick(answers, "studentTranscripts", "student_transcripts"), context),
    transcripts: normalizeResponseMap(answers.transcripts, context),
    blockResponses,
    quizSelections: normalizeResponseMap(pick(answers, "quizSelections", "quiz_selections"), context),
    audioUploads: normalizeResponseMap(audioUploadPayload, context, AUDIO_UPLOAD_VALUE_KEYS),
  };
}
