export type AcademisTier = "free" | "paid";

export const ACADEMIS_MODEL_OPTIONS = [
  {
    model: "google/gemini-2.5-flash",
    tier: "free",
    vendor: "Google",
    name: "Gemini 2.5 Flash",
    tierLabel: "Free / AI Studio",
    useCase: "Speaking, Shadowing & Audio analysis",
  },
  {
    model: "google/gemini-2.5-flash",
    tier: "paid",
    vendor: "Google",
    name: "Gemini 2.5 Flash",
    tierLabel: "Paid / PaasTA",
    useCase: "Reliable high-speed Audio & Text fallback",
  },
  {
    model: "google/gemini-3-flash-preview",
    tier: "paid",
    vendor: "Google",
    name: "Gemini 3 Flash Preview",
    tierLabel: "Paid / PaasTA",
    useCase: "Multimodal & advanced linguistic tasks",
  },
  {
    model: "openai/gpt-5",
    tier: "paid",
    vendor: "OpenAI",
    name: "GPT-5",
    tierLabel: "Paid / PaasTA",
    useCase: "Deep writing analysis & strict grammar",
  },
  {
    model: "openai/gpt-5-mini",
    tier: "paid",
    vendor: "OpenAI",
    name: "GPT-5 Mini",
    tierLabel: "Paid / PaasTA",
    useCase: "Fast reflection & routine short tasks",
  },
] as const;

export type AcademisModelOption = (typeof ACADEMIS_MODEL_OPTIONS)[number];
