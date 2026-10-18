import type { StudyStepId } from "@/types/lesson";

export type SidebarBlock = {
  id: string;
  title: string;
  body: string;
  icon?: string;
  parentMainBlockId?: string;
  imageUrl?: string;
  altText?: string;
};

export type SidebarBlocksByStep = Partial<Record<Exclude<StudyStepId, "results">, SidebarBlock[]>>;

const SIDEBAR_STEP_KEYS = ["warm_up", "lesson", "listening", "reading", "writing", "speaking"] as const;

function normalizeStepKey(input: string): string | undefined {
  const normalized = input.trim();
  if (!normalized) return undefined;
  const directMatch = SIDEBAR_STEP_KEYS.find((key) => key === normalized || key === normalized.replace(/-/g, "_"));
  if (directMatch) return directMatch;
  const camel = normalized.replace(/[-_ ]+/g, "").toLowerCase();
  const keyByCamel = SIDEBAR_STEP_KEYS.find((key) => key.replace(/_/g, "") === camel);
  return keyByCamel ?? undefined;
}

export function normalizeSidebarBlocksByStep(raw: unknown): SidebarBlocksByStep {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const source = raw as Record<string, unknown>;
  const out: Record<string, SidebarBlock[]> = {};

  for (const key of SIDEBAR_STEP_KEYS) {
    const candidates = [source[key], source[`${key}SidebarBlocks`], source[`${key}_sidebar_blocks`], source[`${key}Sidebar`], source[`${key}_sidebar`]];
    const resolved = candidates.find((value): value is unknown[] => Array.isArray(value));
    if (!resolved) continue;
    const blocks: SidebarBlock[] = resolved
      .filter((item): item is Record<string, unknown> => !!item && typeof item === "object" && !Array.isArray(item))
      .map((item, index) => ({
        id: typeof item.id === "string" && item.id.trim() ? item.id.trim() : `sidebar-${key}-${Date.now()}-${index}`,
        title: typeof item.title === "string" ? item.title : typeof item.name === "string" ? item.name : "Sidebar note",
        body: typeof item.body === "string" ? item.body : typeof item.text === "string" ? item.text : "",
        imageUrl: typeof item.imageUrl === "string" ? item.imageUrl : undefined,
        altText: typeof item.altText === "string" ? item.altText : undefined,
        icon: typeof item.icon === "string" ? item.icon : undefined,
        parentMainBlockId: typeof item.parentMainBlockId === "string" && item.parentMainBlockId.trim() ? item.parentMainBlockId.trim() : undefined,
      }));
    if (blocks.length) out[key] = blocks;
  }

  const aliasSource = source.sidebarBlocksByStep ?? source.sidebar_blocks_by_step ?? source.sidebarBlocks ?? source.sidebar_blocks;
  if (aliasSource && typeof aliasSource === "object" && !Array.isArray(aliasSource)) {
    for (const [rawKey, value] of Object.entries(aliasSource as Record<string, unknown>)) {
      const normalizedKey = normalizeStepKey(rawKey);
      if (!normalizedKey || !Array.isArray(value)) continue;
      const blocks = value
        .filter((item): item is Record<string, unknown> => !!item && typeof item === "object" && !Array.isArray(item))
        .map((item, index) => ({
          id: typeof item.id === "string" && item.id.trim() ? item.id.trim() : `sidebar-${normalizedKey}-${Date.now()}-${index}`,
          title: typeof item.title === "string" ? item.title : typeof item.name === "string" ? item.name : "Sidebar note",
          body: typeof item.body === "string" ? item.body : typeof item.text === "string" ? item.text : "",
          imageUrl: typeof item.imageUrl === "string" ? item.imageUrl : undefined,
          altText: typeof item.altText === "string" ? item.altText : undefined,
          icon: typeof item.icon === "string" ? item.icon : undefined,
          parentMainBlockId: typeof item.parentMainBlockId === "string" && item.parentMainBlockId.trim() ? item.parentMainBlockId.trim() : undefined,
        }));
      if (blocks.length) out[normalizedKey] = blocks;
    }
  }

  return out as SidebarBlocksByStep;
}

export function cloneSidebarBlocksByStep(blocks: SidebarBlocksByStep): SidebarBlocksByStep {
  const out: SidebarBlocksByStep = {};
  for (const key of SIDEBAR_STEP_KEYS) {
    const list = blocks[key];
    if (list?.length) out[key] = list.map((block) => ({ ...block }));
  }
  return out;
}

export function getSidebarBlocksForStep(raw: unknown, step: StudyStepId | string): SidebarBlock[] {
  const normalized = normalizeSidebarBlocksByStep(raw) as Record<string, SidebarBlock[]>;
  const stepKey = typeof step === "string" ? normalizeStepKey(step) : undefined;
  if (!stepKey) return [];
  return normalized[stepKey] || [];
}
