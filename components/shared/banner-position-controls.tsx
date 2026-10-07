"use client";

import type { BannerFocalPosition } from "@/lib/banner-position";

interface BannerPositionControlsProps {
  position: BannerFocalPosition;
  dimness: number;
  onPositionChange: (position: BannerFocalPosition) => void;
  onDimnessChange: (dimness: number) => void;
  dimnessLabel?: string;
}

export function BannerPositionControls({
  position,
  dimness,
  onPositionChange,
  onDimnessChange,
  dimnessLabel = "Banner dimness",
}: BannerPositionControlsProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block text-[10px] text-stone-400">
        Horizontal position <span className="float-right text-stone-500">{position.x}%</span>
        <input
          type="range"
          min="0"
          max="100"
          value={position.x}
          onChange={(event) => onPositionChange({ ...position, x: Number(event.target.value) })}
          aria-label="Banner horizontal position"
          className="mt-1 w-full accent-amber-500"
        />
      </label>
      <label className="block text-[10px] text-stone-400">
        Vertical position <span className="float-right text-stone-500">{position.y}%</span>
        <input
          type="range"
          min="0"
          max="100"
          value={position.y}
          onChange={(event) => onPositionChange({ ...position, y: Number(event.target.value) })}
          aria-label="Banner vertical position"
          className="mt-1 w-full accent-amber-500"
        />
      </label>
      <label className="block text-[10px] text-stone-400 sm:col-span-2">
        {dimnessLabel} <span className="float-right text-stone-500">{dimness}%</span>
        <input
          type="range"
          min="0"
          max="100"
          value={dimness}
          onChange={(event) => onDimnessChange(Number(event.target.value))}
          aria-label="Banner dimness"
          className="mt-1 w-full accent-amber-500"
        />
      </label>
    </div>
  );
}
