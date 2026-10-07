"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { loadResourceAssets, useResourceAssets } from "@/lib/resource-hub-store";
import type { MainCategory, ResourceAsset } from "@/types/resource-hub";

const CATEGORY_TABS: { id: MainCategory | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "documents", label: "Documents" },
  { id: "videos", label: "Videos" },
  { id: "audios", label: "Audios" },
  { id: "visuals", label: "Visuals" },
  { id: "others", label: "Others" },
];

export function ResourceHubImportDialog({
  instructorId,
  importedAssetIds,
  onClose,
  onImport,
}: {
  instructorId: string;
  importedAssetIds: string[];
  onClose: () => void;
  onImport: (assets: ResourceAsset[]) => void;
}) {
  const { assets, loading, error } = useResourceAssets(instructorId);
  const [category, setCategory] = useState<MainCategory | "all">("all");
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const filteredAssets = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return assets.filter((asset) => (
      (category === "all" || asset.mainCategory === category)
      && (!normalizedQuery || [asset.title, asset.description || "", ...asset.tags]
        .some((value) => value.toLocaleLowerCase().includes(normalizedQuery)))
    ));
  }, [assets, category, query]);

  const selectedAssets = assets.filter((asset) => selectedIds.has(asset.id) && !importedAssetIds.includes(asset.id));

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section role="dialog" aria-modal="true" aria-labelledby="import-resource-hub-title" className="my-auto flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl border border-border bg-[#141a23] p-5 shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Lesson Builder</p>
            <h3 id="import-resource-hub-title" className="mt-1 text-xl font-semibold text-stone-100">Import from Resource Hub</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Close import dialog" className="rounded-md p-2 text-stone-400 transition hover:bg-white/5 hover:text-stone-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <label className="relative block">
            <span className="sr-only">Search Resource Hub assets</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search assets by title, description, or tags"
              className="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-xs text-stone-200 outline-none placeholder:text-stone-600 focus:border-amber-500/40"
            />
          </label>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter assets by main category">
            {CATEGORY_TABS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                aria-pressed={category === id}
                onClick={() => setCategory(id)}
                className={`rounded-full border px-3 py-1.5 text-xs transition ${category === id ? "border-amber-500/40 bg-amber-500/10 text-amber-300" : "border-border text-stone-400 hover:text-stone-200"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto rounded-lg border border-border">
          {loading ? (
            <p className="px-4 py-10 text-center text-sm text-stone-400" role="status">Loading Resource Hub assets...</p>
          ) : error ? (
            <div className="px-4 py-10 text-center text-sm text-rose-300" role="alert">
              <p>{error}</p>
              <button type="button" onClick={() => void loadResourceAssets(instructorId)} className="mt-3 underline underline-offset-2">Retry</button>
            </div>
          ) : filteredAssets.length ? (
            <ul className="divide-y divide-border">
              {filteredAssets.map((asset) => {
                const alreadyImported = importedAssetIds.includes(asset.id);
                return (
                  <li key={asset.id}>
                    <label className={`flex cursor-pointer items-start gap-3 p-3 transition hover:bg-white/[0.03] ${alreadyImported ? "cursor-not-allowed opacity-50" : ""}`}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(asset.id)}
                        disabled={alreadyImported}
                        onChange={(event) => setSelectedIds((current) => {
                          const next = new Set(current);
                          if (event.target.checked) next.add(asset.id);
                          else next.delete(asset.id);
                          return next;
                        })}
                        className="mt-1 h-4 w-4 shrink-0 accent-amber-500"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-stone-100">{asset.title}</span>
                          {alreadyImported && <span className="rounded-full border border-border px-2 py-0.5 text-[9px] uppercase tracking-wide text-stone-400">Already in lesson</span>}
                        </span>
                        <span className="mt-1 block text-xs text-stone-400">{asset.description || asset.url}</span>
                        <span className="mt-2 flex flex-wrap gap-1.5">
                          {[asset.mainCategory, asset.subCategory, asset.cefrLevel].map((label) => (
                            <span key={label} className="rounded-full border border-border px-2 py-0.5 text-[10px] text-stone-400">{label}</span>
                          ))}
                          {asset.isDownloadable && <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300">Downloadable</span>}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-4 py-10 text-center text-sm text-stone-500">No matching Resource Hub assets.</p>
          )}
        </div>

        <div className="mt-4 flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs text-stone-500">{selectedAssets.length} selected</span>
          <div className="flex flex-col-reverse gap-3 sm:flex-row">
            <button type="button" onClick={onClose} className="h-10 rounded-md border border-border px-4 text-xs text-stone-300 transition hover:bg-white/5">Cancel</button>
            <button
              type="button"
              disabled={!selectedAssets.length}
              onClick={() => onImport(selectedAssets)}
              className="h-10 rounded-md bg-amber-500/20 px-4 text-xs font-medium text-amber-300 transition hover:bg-amber-500/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Import Selected ({selectedAssets.length})
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
