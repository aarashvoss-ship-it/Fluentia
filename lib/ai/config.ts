import type { AiInputAudioPart } from "@/lib/ai/audio";
import {
  ACADEMIS_MODEL_OPTIONS,
  type AcademisTier,
} from "./models";

export type AiTokenLimitParameter = "max_completion_tokens" | "max_tokens";
export type AiModelVendor = "openai" | "gemini" | "other";
export type AiStructuredOutputMode = "json_schema" | "json_object";

export interface AiModelProfile {
  model: string;
  vendor: AiModelVendor;
  provider: "google-ai-studio" | "paasta";
  structuredOutputMode: AiStructuredOutputMode;
  endpoint: string;
  apiKeyEnv: string;
  tokenLimitParameter: AiTokenLimitParameter;
  maxOutputTokens?: number;
}

export interface AiChatMessage {
  role: "system" | "user" | "assistant";
  content: string | Array<{ type: "text"; text: string } | AiInputAudioPart>;
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
    provider: "paasta",
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
  return process.env[profile.apiKeyEnv]?.trim() || process.env.AI_API_KEY?.trim() || "";
}

function getPaastaChatCompletionsEndpoint(): string {
  const configuredEndpoint = process.env.PAASTA_AI_API_BASE_URL?.trim()
    || process.env.PAASTA_AI_BASE_URL?.trim()
    || process.env.AI_CHAT_COMPLETIONS_URL?.trim();
  if (!configuredEndpoint) return DEFAULT_CHAT_COMPLETIONS_ENDPOINT;

  const url = new URL(configuredEndpoint);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("PAASTA_AI_API_BASE_URL must use HTTP or HTTPS.");
  }
  if (!/\/chat\/completions\/?$/.test(url.pathname)) {
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/chat/completions`;
  }
  return url.toString();
}

function getGoogleAiStudioEndpoint(model: string): string {
  const baseUrl = process.env.GOOGLE_AI_STUDIO_API_BASE_URL?.trim()
    || "https://generativelanguage.googleapis.com/v1beta";
  const url = new URL(baseUrl);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("GOOGLE_AI_STUDIO_API_BASE_URL must use HTTP or HTTPS.");
  }
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/models/${encodeURIComponent(model.replace(/^google\//, ""))}:generateContent`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function getAcademisModelProfile(
  model: string,
  tier: AcademisTier,
): AiModelProfile | null {
  const option = ACADEMIS_MODEL_OPTIONS.find((candidate) =>
    candidate.model === model && candidate.tier === tier,
  );
  if (!option) return null;

  const vendor = getModelVendor(model);
  const isFreeGoogle = tier === "free";
  const tokenParameterOverride = process.env.ACADEMIS_EVAL_TOKEN_LIMIT_PARAMETER?.trim()
    || process.env.AI_TOKEN_LIMIT_PARAMETER?.trim();
  return {
    model,
    vendor,
    provider: isFreeGoogle ? "google-ai-studio" : "paasta",
    structuredOutputMode: vendor === "openai" ? "json_schema" : "json_object",
    endpoint: isFreeGoogle
      ? getGoogleAiStudioEndpoint(model)
      : getPaastaChatCompletionsEndpoint(),
    apiKeyEnv: isFreeGoogle ? "GOOGLE_AI_STUDIO_API_KEY" : "PAASTA_AI_API_KEY",
    tokenLimitParameter: getTokenLimitParameter(model, vendor, tokenParameterOverride),
    maxOutputTokens: getOptionalPositiveInteger("ACADEMIS_EVAL_MAX_OUTPUT_TOKENS")
      ?? getOptionalPositiveInteger("AI_MAX_OUTPUT_TOKENS")
      ?? 8192,
  };
}

export function getAcademisAiApiKey(profile: AiModelProfile): string {
  return process.env[profile.apiKeyEnv]?.trim() || "";
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
