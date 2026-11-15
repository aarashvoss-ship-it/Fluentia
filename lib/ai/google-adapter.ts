function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function toGoogleResponseSchema(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value) || typeof value.type !== "string") return undefined;
  const typeNames: Record<string, string> = {
    object: "OBJECT",
    array: "ARRAY",
    string: "STRING",
    integer: "INTEGER",
    number: "NUMBER",
    boolean: "BOOLEAN",
  };
  const type = typeNames[value.type];
  if (!type) return undefined;

  const schema: Record<string, unknown> = { type };
  if (Array.isArray(value.required)) {
    schema.required = value.required.filter((item): item is string => typeof item === "string");
  }
  if (Array.isArray(value.enum)) schema.enum = value.enum;
  if (isRecord(value.properties)) {
    const properties: Record<string, Record<string, unknown>> = {};
    for (const [key, property] of Object.entries(value.properties)) {
      const converted = toGoogleResponseSchema(property);
      if (converted) properties[key] = converted;
    }
    schema.properties = properties;
  }
  if (value.items !== undefined) {
    const items = toGoogleResponseSchema(value.items);
    if (items) schema.items = items;
  }
  return schema;
}

export interface GoogleAiStudioRequestOptions {
  systemPrompt: string;
  userPrompt: string;
  responseSchema: unknown;
  maxOutputTokens?: number;
  audio?: {
    mimeType: string;
    data: string;
  };
}

export function buildGoogleAiStudioRequestBody(options: GoogleAiStudioRequestOptions) {
  const parts: Array<Record<string, unknown>> = [{ text: options.userPrompt }];
  if (options.audio) {
    parts.push({
      inlineData: {
        mimeType: options.audio.mimeType.split(";")[0].trim(),
        data: options.audio.data,
      },
    });
  }

  const responseSchema = toGoogleResponseSchema(options.responseSchema);
  return {
    systemInstruction: { parts: [{ text: options.systemPrompt }] },
    contents: [{ role: "user", parts }],
    generationConfig: {
      responseMimeType: "application/json",
      ...(responseSchema ? { responseSchema } : {}),
      ...(options.maxOutputTokens ? { maxOutputTokens: options.maxOutputTokens } : {}),
    },
  };
}

export function getRetryAfterText(headers: Headers, now = Date.now()): string {
  const candidates = [
    { value: headers.get("retry-after")?.trim(), isReset: false },
    { value: headers.get("x-ratelimit-reset")?.trim(), isReset: true },
  ];
  for (const candidate of candidates) {
    if (!candidate.value) continue;
    let seconds: number;
    if (/^\d+(?:\.\d+)?$/.test(candidate.value)) {
      const numericValue = Number(candidate.value);
      if (candidate.isReset && numericValue >= 1_000_000_000_000) {
        seconds = numericValue / 1000 - now / 1000;
      } else if (candidate.isReset && numericValue >= 1_000_000_000) {
        seconds = numericValue - now / 1000;
      } else {
        seconds = numericValue;
      }
    } else {
      const dateValue = Date.parse(candidate.value);
      if (!Number.isFinite(dateValue)) continue;
      seconds = (dateValue - now) / 1000;
    }
    if (!Number.isFinite(seconds)) continue;
    if (seconds < 60) return "less than a minute";

    const minutes = Math.ceil(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (!hours) return `about ${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
    if (!remainingMinutes) return `about ${hours} ${hours === 1 ? "hour" : "hours"}`;
    return `about ${hours} ${hours === 1 ? "hour" : "hours"} and ${remainingMinutes} ${remainingMinutes === 1 ? "minute" : "minutes"}`;
  }
  return "an unknown time; try again later";
}
