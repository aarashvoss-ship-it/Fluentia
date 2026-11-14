export type AiTokenLimitParameter = "max_completion_tokens" | "max_tokens";
export type AiModelVendor = "openai" | "gemini" | "other";
export type AiStructuredOutputMode = "json_schema" | "json_object";

export interface AiModelProfile {
  model: string;
  vendor: AiModelVendor;
  structuredOutputMode: AiStructuredOutputMode;
  endpoint: string;
  apiKeyEnv: string;
  tokenLimitParameter: AiTokenLimitParameter;
  maxOutputTokens?: number;
}

export interface AiChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const DEFAULT_CHAT_COMPLETIONS_ENDPOINT = "https://console.paasta.cloud/api/ai/v1/chat/completions";

function getModelVendor(model: string): AiModelVendor {
  const normalized = model.toLowerCase();
  if (normalized.includes("gemini") || normalized.startsWith("google/")) return "gemini";
  if (normalized.includes("gpt") || normalized.startsWith("openai/")) return "openai";
  return "other";
}

function getTokenLimitParameter(
  model: string,
  vendor: AiModelVendor,
  override: string | undefined,
): AiTokenLimitParameter {
  if (override === "max_tokens" || override === "max_completion_tokens") return override;
  if (override) {
    throw new Error("AI token parameter must be max_tokens or max_completion_tokens.");
  }
  return vendor === "openai" && /(?:^|\/)(?:gpt-5(?:[./_-]|$)|o[134](?:[./_-]|$))/i.test(model)
    ? "max_completion_tokens"
    : "max_tokens";
}

function getOptionalPositiveInteger(envName: string): number | undefined {
  const value = process.env[envName]?.trim();
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${envName} must be a positive integer.`);
  }
  return parsed;
}

function createModelProfile(
  modelEnv: string,
  tokenParameterEnv: string,
  maxOutputTokensEnv: string,
  defaultMaxOutputTokens: number,
): AiModelProfile {
  const sharedModel = process.env.AI_MODEL?.trim()
    || process.env.PAASTA_AI_MODEL?.trim()
    || "openai/gpt-5";
  const model = process.env[modelEnv]?.trim() || sharedModel;
  const vendor = getModelVendor(model);
  const tokenParameterOverride = process.env[tokenParameterEnv]?.trim()
    || process.env.AI_TOKEN_LIMIT_PARAMETER?.trim();
  return {
    model,
    vendor,
    structuredOutputMode: vendor === "openai" ? "json_schema" : "json_object",
    endpoint: process.env.AI_CHAT_COMPLETIONS_URL?.trim()
      || process.env.PAASTA_AI_BASE_URL?.trim()
      || DEFAULT_CHAT_COMPLETIONS_ENDPOINT,
    apiKeyEnv: "PAASTA_AI_API_KEY",
    tokenLimitParameter: getTokenLimitParameter(model, vendor, tokenParameterOverride),
    maxOutputTokens: getOptionalPositiveInteger(maxOutputTokensEnv)
      ?? getOptionalPositiveInteger("AI_MAX_OUTPUT_TOKENS")
      ?? defaultMaxOutputTokens,
  };
}

export const ACADEMIS_EVAL_MODEL = createModelProfile(
  "ACADEMIS_EVAL_MODEL",
  "ACADEMIS_EVAL_TOKEN_LIMIT_PARAMETER",
  "ACADEMIS_EVAL_MAX_OUTPUT_TOKENS",
  8192,
);

export const LESSON_BUILDER_MODEL = createModelProfile(
  "LESSON_BUILDER_MODEL",
  "LESSON_BUILDER_TOKEN_LIMIT_PARAMETER",
  "LESSON_BUILDER_MAX_OUTPUT_TOKENS",
  8192,
);

export function getAiApiKey(profile: AiModelProfile) {
  return process.env[profile.apiKeyEnv] || process.env.AI_API_KEY || "";
}

export function getAiStructuredResponseFormat(profile: AiModelProfile, schema: unknown) {
  return profile.structuredOutputMode === "json_schema"
    ? schema
    : { type: "json_object" };
}

export function buildAiChatCompletionBody(
  profile: AiModelProfile,
  messages: AiChatMessage[],
  options: { response_format?: unknown } = {},
) {
  const body: Record<string, unknown> = {
    model: profile.model,
    messages,
    ...options,
  };
  if (profile.maxOutputTokens !== undefined) {
    body[profile.tokenLimitParameter] = profile.maxOutputTokens;
  }
  return body;
}
