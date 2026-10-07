export interface BannerFocalPosition {
  x: number;
  y: number;
}

export const DEFAULT_BANNER_IMAGE_URL =
  "https://images.unsplash.com/photo-1460551204960-763bc82b7d8f?q=80&w=1172&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D";

export function getFirstNonEmptyBannerUrl(...values: unknown[]): string | undefined {
  return values.find(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  )?.trim();
}

export function normalizeBannerDimness(value: unknown, fallback = 20): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(100, value))
    : fallback;
}

export function getBannerOverlayStyles(dimness: unknown) {
  return {
    opacity: normalizeBannerDimness(dimness) / 100,
    background: "linear-gradient(90deg,rgba(12,16,23,.72),rgba(12,16,23,.24)),linear-gradient(0deg,rgba(12,16,23,.92),transparent 65%)",
  };
}

export function normalizeBannerPosition(value: unknown): BannerFocalPosition {
  const position = typeof value === "number"
    ? { x: 50, y: value }
    : value && typeof value === "object" && !Array.isArray(value)
      ? value as { x?: unknown; y?: unknown }
      : {};
  return {
    x: typeof position.x === "number" && Number.isFinite(position.x) ? Math.max(0, Math.min(100, position.x)) : 50,
    y: typeof position.y === "number" && Number.isFinite(position.y) ? Math.max(0, Math.min(100, position.y)) : 50,
  };
}

export function getBannerPositionStyles(position: BannerFocalPosition) {
  const horizontalPan = (50 - position.x) / 10;
  const verticalPan = (50 - position.y) / 10;
  return {
    objectPosition: `${position.x}% ${position.y}%`,
    transform: `translate(${horizontalPan}%, ${verticalPan}%) scale(1.1)`,
  };
}
