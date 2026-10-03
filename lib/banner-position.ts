export interface BannerFocalPosition {
  x: number;
  y: number;
}

export function normalizeBannerDimness(value: unknown, fallback = 20): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(100, value))
    : fallback;
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
