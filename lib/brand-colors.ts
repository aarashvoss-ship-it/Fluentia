const LEGACY_AMBER_COLOR_PATTERN = /#(?:d97706|fbbf24|fcd34d|fde68a)\b|rgba?\(\s*(?:217\s*,\s*119\s*,\s*6|251\s*,\s*191\s*,\s*36|252\s*,\s*211\s*,\s*77|253\s*,\s*230\s*,\s*138)\s*(?:,\s*[\d.]+\s*)?\)/gi;

function normalizeAmberColor(color: string): string {
  const alpha = color.match(/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)/i)?.[1];
  return alpha ? `rgba(245, 158, 11, ${alpha})` : "#F59E0B";
}

export function normalizeLegacyAmberMarkup(value: string): string {
  return value
    .replace(/(style\s*=\s*)(["'])(.*?)\2/gi, (_match, prefix: string, quote: string, style: string) => (
      `${prefix}${quote}${style.replace(LEGACY_AMBER_COLOR_PATTERN, normalizeAmberColor)}${quote}`
    ))
    .replace(/(color\s*=\s*)(["'])(.*?)\2/gi, (_match, prefix: string, quote: string, color: string) => (
      `${prefix}${quote}${color.replace(LEGACY_AMBER_COLOR_PATTERN, normalizeAmberColor)}${quote}`
    ));
}
