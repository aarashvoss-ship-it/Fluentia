export type AcademisTier = "free" | "paid";
export type AcademisProvider = "google-ai-studio" | "openai-api" | "paasta";

export const ACADEMIS_MODEL_OPTIONS = [
  {
    model: "google/gemini-flash-latest",
    tier: "free",
    vendor: "Google",
    name: "Gemini Flash Latest",
    tierLabel: "Free",
    useCase: "Speaking, Shadowing & Audio Analysis",
    provider: "google-ai-studio",
    apiKeyEnv: "GEMINI_API_KEY",
    apiKeyFallbackEnv: "GEMINI_API_2ND_KEY",
  },
  {
    model: "google/gemini-2.5-flash",
    tier: "paid",
    vendor: "Google",
    name: "Gemini 2.5 Flash",
    tierLabel: "Paid",
    useCase: "Reliable high-speed Audio & Text fallback",
    provider: "paasta",
    apiKeyEnv: "PAASTA_GEMINI_2_5_FLASH_KEY",
  },
  {
    model: "google/gemini-3-flash-preview",
    tier: "paid",
    vendor: "Google",
    name: "Gemini 3 Flash Preview",
    tierLabel: "Paid",
    useCase: "Multimodal & Advanced linguistic tasks",
    provider: "paasta",
    apiKeyEnv: "PAASTA_GEMINI_3_FLASH_KEY",
  },
  {
    model: "openai/gpt-4o-mini",
    tier: "free",
    vendor: "OpenAI",
    name: "GPT",
    tierLabel: "Free",
    useCase: "General free-tier text & reflection tasks",
    provider: "openai-api",
    apiKeyEnv: "OPENAI_API_KEY",
    apiKeyFallbackEnv: "OPENAI_API_2ND_KEY",
  },
  {
    model: "openai/gpt-5-mini",
    tier: "paid",
    vendor: "OpenAI",
    name: "GPT-5 Mini",
    tierLabel: "Paid",
    useCase: "Reflection & routine short tasks",
    provider: "paasta",
    apiKeyEnv: "PAASTA_GPT_5_MINI_KEY",
  },
  {
    model: "openai/gpt-5",
    tier: "paid",
    vendor: "OpenAI",
    name: "GPT-5",
    tierLabel: "Paid",
    useCase: "Deep writing analysis & strict grammar",
    provider: "paasta",
    apiKeyEnv: "PAASTA_GPT_5_KEY",
  },
] as const;

export type AcademisModelOption = (typeof ACADEMIS_MODEL_OPTIONS)[number];
