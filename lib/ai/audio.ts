export type AiAudioFormat = "wav" | "mp3" | "webm" | "mp4" | "ogg";

export interface AiInputAudioPart {
  type: "input_audio";
  input_audio: {
    data: string;
    format: AiAudioFormat;
  };
}

const AUDIO_FORMATS: Record<string, AiAudioFormat> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/webm": "webm",
  "audio/mp4": "mp4",
  "audio/ogg": "ogg",
};

export function getAiAudioFormat(contentType: string): AiAudioFormat | null {
  const mimeType = contentType.split(";")[0].trim().toLowerCase();
  return AUDIO_FORMATS[mimeType] || null;
}

export function createAiInputAudioPart(
  base64Data: string,
  contentType: string,
): AiInputAudioPart | null {
  const format = getAiAudioFormat(contentType);
  if (!format || !base64Data) return null;
  return {
    type: "input_audio",
    input_audio: { data: base64Data, format },
  };
}

export function getAudioTranscriptionEndpoint(
  chatCompletionEndpoint: string,
  configuredEndpoint?: string,
): string {
  const endpoint = configuredEndpoint?.trim();
  if (endpoint) {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("ACADEMIS_STT_URL must use HTTP or HTTPS.");
    }
    return url.toString();
  }

  const url = new URL(chatCompletionEndpoint);
  if (!/\/chat\/completions\/?$/.test(url.pathname)) {
    throw new Error("Set ACADEMIS_STT_URL when the AI completion endpoint does not end in /chat/completions.");
  }
  url.pathname = url.pathname.replace(/\/chat\/completions\/?$/, "/audio/transcriptions");
  return url.toString();
}
