"use client";

import React, { useState } from "react";
import { Image, Upload, Check } from "lucide-react";

interface BannerManagerProps {
  bannerUrl?: string;
  customInput?: string;
  onUpdateBanner: (url: string) => void;
  onUpdateCustomInput?: (url: string) => void;
}

const PRESET_BANNERS = [
  "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1200&q=80",
];

export function InstructorBannerManager({
  bannerUrl = PRESET_BANNERS[0],
  customInput = "",
  onUpdateBanner,
  onUpdateCustomInput,
}: BannerManagerProps) {
  const [selectedUrl, setSelectedUrl] = useState<string>(bannerUrl);

  const handleSelect = (url: string) => {
    setSelectedUrl(url);
    onUpdateBanner(url);
  };

  const handleCustomApply = () => {
    if (customInput.trim()) {
      handleSelect(customInput.trim());
      onUpdateCustomInput?.("");
    }
  };

  return (
    <div className="bg-[#171d28]/60 border border-[#202631] rounded-xl p-5 text-[#d9dce0]">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-[var(--font-fraunces)] text-xl font-semibold flex items-center gap-2">
          <Image className="w-5 h-5 text-amber-400" />
          Lesson Hero Banner
        </h3>
        <span className="text-xs bg-amber-500/10 text-amber-400 px-2.5 py-1 rounded-full border border-amber-500/20">
          Dynamic Storage Ready
        </span>
      </div>

      <div className="relative h-36 w-full rounded-lg overflow-hidden border border-[#202631] mb-4 bg-black/40">
        {selectedUrl ? (
          <img
            src={selectedUrl}
            alt="Hero Preview"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm">
            No banner selected
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0c1017]/80 to-transparent flex items-end p-3">
          <span className="text-xs text-[#d9dce0]">Current Live Banner</span>
        </div>
      </div>

      <div className="space-y-3">
        <label className="text-xs text-slate-400 font-medium block">Preset Collection</label>
        <div className="grid grid-cols-3 gap-2">
          {PRESET_BANNERS.map((preset, index) => {
            const isSelected = selectedUrl === preset;
            return (
              <button
                key={index}
                onClick={() => handleSelect(preset)}
                className={`relative h-16 rounded-md overflow-hidden border transition ${
                  isSelected ? "border-amber-500 ring-1 ring-amber-500" : "border-[#202631] opacity-70 hover:opacity-100"
                }`}
              >
                <img src={preset} alt={`Preset ${index + 1}`} className="w-full h-full object-cover" />
                {isSelected && (
                    <div className="absolute inset-0 bg-amber-500/20 flex items-center justify-center">
                    <Check className="w-4 h-4 text-white drop-shadow" />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <div className="pt-2">
          <label className="text-xs text-slate-400 font-medium block mb-1.5">Custom Image URL</label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Paste image URL or Supabase link..."
              value={customInput}
              onChange={(e) => onUpdateCustomInput?.(e.target.value)}
              className="flex-1 bg-[#0c1017] border border-[#202631] rounded-lg px-3 py-2 text-xs text-[#d9dce0] focus:outline-none focus:border-amber-500"
            />
            <button
              onClick={handleCustomApply}
              className="bg-[#202631] hover:bg-[#29303c] text-xs px-3 py-2 rounded-lg font-medium transition flex items-center gap-1.5"
            >
              <Upload className="w-3.5 h-3.5" /> Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
