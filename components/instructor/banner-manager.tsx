"use client";

import React, { useState } from "react";
import { Image, Upload, Check } from "lucide-react";

interface BannerManagerProps {
  bannerUrl?: string;
  onUpdateBanner: (url: string) => void;
}

const PRESET_BANNERS = [
  "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1200&q=80",
];

export function InstructorBannerManager({
  bannerUrl = PRESET_BANNERS[0],
  onUpdateBanner,
}: BannerManagerProps) {
  const [selectedUrl, setSelectedUrl] = useState<string>(bannerUrl);
  const [customInput, setCustomInput] = useState<string>("");

  const handleSelect = (url: string) => {
    setSelectedUrl(url);
    onUpdateBanner(url);
  };

  const handleCustomApply = () => {
    if (customInput.trim()) {
      handleSelect(customInput.trim());
      setCustomInput("");
    }
  };

  return (
    <div className="bg-[#182635] border border-[#273647] rounded-xl p-5 shadow-sm text-[#d4e4fa]">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-medium flex items-center gap-2">
          <Image className="w-5 h-[#ffc66b]" />
          Lesson Hero Banner
        </h3>
        <span className="text-xs bg-[#122131] text-[#7ed8ab] px-2.5 py-1 rounded-full border border-[#273647]">
          Dynamic Storage Ready
        </span>
      </div>

      <div className="relative h-36 w-full rounded-lg overflow-hidden border border-[#273647] mb-4 bg-black/40">
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
        <div className="absolute inset-0 bg-gradient-to-t from-[#122131]/80 to-transparent flex items-end p-3">
          <span className="text-xs text-[#d4e4fa] font-mono">Current Live Banner</span>
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
                  isSelected ? "border-[#ffc66b] ring-1 ring-[#ffc66b]" : "border-[#273647] opacity-70 hover:opacity-100"
                }`}
              >
                <img src={preset} alt={`Preset ${index + 1}`} className="w-full h-full object-cover" />
                {isSelected && (
                  <div className="absolute inset-0 bg-[#ffc66b]/20 flex items-center justify-center">
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
              onChange={(e) => setCustomInput(e.target.value)}
              className="flex-1 bg-[#122131] border border-[#273647] rounded-lg px-3 py-2 text-xs text-[#d4e4fa] focus:outline-none focus:border-[#ffc66b]"
            />
            <button
              onClick={handleCustomApply}
              className="bg-[#273647] hover:bg-[#344659] text-xs px-3 py-2 rounded-lg font-medium transition flex items-center gap-1.5"
            >
              <Upload className="w-3.5 h-3.5" /> Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
