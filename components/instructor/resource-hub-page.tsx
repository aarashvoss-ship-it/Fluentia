"use client";

import { ExternalLink, FileText, Film, Grid2X2, Headphones, Image, List, PackageOpen, Plus, Search, Trash2, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { MusicLibraryManager } from "@/components/instructor/music-library-manager";
import { DeleteConfirmationDialog, type DeleteConfirmationRequest } from "@/components/shared/delete-confirmation-dialog";
import { addResourceAsset, deleteResourceAsset, loadResourceAssets, useResourceAssets } from "@/lib/resource-hub-store";
import type { CEFRLevel, MainCategory, ResourceAssetInput, SubCategory } from "@/types/resource-hub";

const RESOURCE_CATEGORIES: {
  id: MainCategory;
  label: string;
  description: string;
  subCategories: SubCategory[];
  icon: typeof FileText;
}[] = [
  {
    id: "documents",
    label: "Documents",
    description: "Reading and written materials",
    subCategories: ["eBooks", "PDFs", "Texts", "Lyrics"],
    icon: FileText,
  },
  {
    id: "videos",
    label: "Videos",
    description: "Video and viewing materials",
    subCategories: ["YouTube", "Movies", "TV Shows", "Other Videos"],
    icon: Film,
  },
  {
    id: "audios",
    label: "Audios",
    description: "Listening and audio materials",
    subCategories: ["Audiobooks", "Podcasts", "Songs", "Instrumental", "Study Room Music"],
    icon: Headphones,
  },
  {
    id: "visuals",
    label: "Visuals",
    description: "Images and visual learning aids",
    subCategories: ["Infographics", "Images", "Diagrams", "Flashcards"],
    icon: Image,
  },
  {
    id: "others",
    label: "Others",
    description: "Everything else for your classes",
    subCategories: ["General"],
    icon: PackageOpen,
  },
];

const CEFR_LEVELS: CEFRLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2", "All Levels"];

const EMPTY_ASSET_DRAFT = {
  title: "",
  description: "",
  mainCategory: "documents" as MainCategory,
  subCategory: "eBooks" as SubCategory,
  url: "",
  cefrLevel: "All Levels" as CEFRLevel,
  tags: "",
  isDownloadable: false,
};

type AssetView = "grid" | "list";
type AssetSort = "newest" | "title" | "category";

function getCategoryLabel(category: MainCategory) {
  return RESOURCE_CATEGORIES.find(({ id }) => id === category)?.label || category;
}

function formatCreatedAt(createdAt: string) {
  return new Date(createdAt).toLocaleDateString();
}

function isStudyRoomMusicAsset(asset: { mainCategory: MainCategory; subCategory: SubCategory; tags: string[] }) {
  return asset.mainCategory === "audios" && (
    asset.subCategory === "Study Room Music" || asset.tags.includes("study-room")
  );
}

export function ResourceHubPage({ instructorId }: { instructorId: string }) {
  const { assets, loading, error: loadError } = useResourceAssets(instructorId);
  const [selectedCategory, setSelectedCategory] = useState<MainCategory | null>(null);
  const [isAddAssetOpen, setIsAddAssetOpen] = useState(false);
  const [assetDraft, setAssetDraft] = useState(EMPTY_ASSET_DRAFT);
  const [searchQuery, setSearchQuery] = useState("");
  const [cefrFilter, setCefrFilter] = useState<CEFRLevel | "all">("all");
  const [sortBy, setSortBy] = useState<AssetSort>("newest");
  const [view, setView] = useState<AssetView>("grid");
  const [isSavingAsset, setIsSavingAsset] = useState(false);
  const [deletingAssetId, setDeletingAssetId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<DeleteConfirmationRequest | null>(null);
  const selectedCategoryDetails = RESOURCE_CATEGORIES.find(({ id }) => id === selectedCategory);

  const browsableAssets = assets.filter((asset) => !isStudyRoomMusicAsset(asset));
  const filteredAssets = browsableAssets
    .filter((asset) => !selectedCategory || asset.mainCategory === selectedCategory)
    .filter((asset) => cefrFilter === "all" || asset.cefrLevel === cefrFilter)
    .filter((asset) => {
      const query = searchQuery.trim().toLocaleLowerCase();
      if (!query) return true;
      return [asset.title, asset.description || "", ...asset.tags]
        .some((value) => value.toLocaleLowerCase().includes(query));
    })
    .sort((first, second) => {
      if (sortBy === "title") return first.title.localeCompare(second.title);
      if (sortBy === "category") {
        return getCategoryLabel(first.mainCategory).localeCompare(getCategoryLabel(second.mainCategory))
          || first.title.localeCompare(second.title);
      }
      return new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime();
    });

  const handleMainCategoryChange = (mainCategory: MainCategory) => {
    const category = RESOURCE_CATEGORIES.find((item) => item.id === mainCategory);
    if (!category) return;
    setAssetDraft((current) => ({ ...current, mainCategory, subCategory: category.subCategories[0] }));
  };

  const handleCreateAsset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const category = RESOURCE_CATEGORIES.find(({ id }) => id === assetDraft.mainCategory);
    if (!category?.subCategories.includes(assetDraft.subCategory)) return;

    const asset: ResourceAssetInput = {
      title: assetDraft.title.trim(),
      description: assetDraft.description.trim() || undefined,
      mainCategory: assetDraft.mainCategory,
      subCategory: assetDraft.subCategory,
      url: assetDraft.url.trim(),
      isDownloadable: assetDraft.isDownloadable,
      cefrLevel: assetDraft.cefrLevel,
      tags: [...new Set(assetDraft.tags.split(",").map((tag) => tag.trim()).filter(Boolean))],
    };

    setIsSavingAsset(true);
    setActionError(null);
    try {
      const createdAsset = await addResourceAsset(asset, instructorId);
      setSelectedCategory(createdAsset.mainCategory);
      setSearchQuery("");
      setCefrFilter("all");
      setSortBy("newest");
      setAssetDraft(EMPTY_ASSET_DRAFT);
      setIsAddAssetOpen(false);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to create Resource Hub asset.");
    } finally {
      setIsSavingAsset(false);
    }
  };

  const openPreview = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const deleteAsset = async (assetId: string) => {
    setDeletingAssetId(assetId);
    setActionError(null);
    try {
      await deleteResourceAsset(assetId);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to delete Resource Hub asset.");
      throw error;
    } finally {
      setDeletingAssetId(null);
    }
  };

  return (
    <section className="mx-auto w-full min-w-0 space-y-6" aria-labelledby="resource-hub-title">
      <div className="rounded-2xl border border-border bg-surface/60 p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-400">Teaching Materials</p>
            <h2 id="resource-hub-title" className="mt-1 font-sans text-2xl font-semibold text-stone-100">Resource Hub</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-400">
              Organize shared documents, videos, audio, visuals, and other materials for your classes.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsAddAssetOpen(true)}
            className="inline-flex w-fit items-center justify-center gap-2 rounded-md bg-amber-500/20 px-4 py-2.5 text-sm font-medium text-amber-300 transition hover:bg-amber-500/30"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add Asset
          </button>
        </div>
      </div>

      {(loadError || actionError) && (
        <div role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {actionError || loadError}
          {loadError && <button type="button" onClick={() => void loadResourceAssets(instructorId)} className="ml-3 underline underline-offset-2">Retry</button>}
        </div>
      )}

      <div>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-stone-100">Browse categories</h3>
            <p className="mt-1 text-xs text-stone-500">Choose a category to filter the resource library.</p>
          </div>
          {selectedCategory && (
            <button
              type="button"
              onClick={() => setSelectedCategory(null)}
              className="text-xs text-amber-400 transition hover:text-amber-300"
            >
              Show all categories
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          {RESOURCE_CATEGORIES.map(({ id, label, description, icon: Icon }) => {
            const isSelected = selectedCategory === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setSelectedCategory(isSelected ? null : id)}
                className={`rounded-xl border p-4 text-left transition ${
                  isSelected
                    ? "border-amber-500/40 bg-amber-500/10"
                    : "border-border bg-surface/60 hover:border-amber-500/30"
                }`}
              >
                <span className={`inline-flex rounded-lg p-2 ${isSelected ? "bg-amber-500/15 text-amber-300" : "bg-background text-stone-400"}`}>
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="mt-3 block text-sm font-semibold text-stone-100">{label}</span>
                <span className="mt-1 block text-xs text-stone-500">{description}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-surface/60 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <div>
            <h3 className="text-sm font-semibold text-stone-100">
              {selectedCategoryDetails ? `${selectedCategoryDetails.label} resources` : "All resources"}
            </h3>
            <p className="mt-1 text-xs text-stone-500">
              Showing {filteredAssets.length} of {browsableAssets.length} assets
            </p>
          </div>
        </div>

        {selectedCategoryDetails && (
          <div className="flex flex-wrap gap-2 border-b border-border py-4" aria-label={`${selectedCategoryDetails.label} resource types`}>
            {selectedCategoryDetails.subCategories.map((subCategory) => (
              <span key={subCategory} className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-stone-300">
                {subCategory}
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-3 border-b border-border py-4 md:flex-row md:items-end">
          <label className="relative block w-full md:min-w-0 md:flex-[2]">
            <span className="sr-only">Search assets</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500" aria-hidden="true" />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search title, description, or tags"
              className="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-xs text-stone-200 outline-none placeholder:text-stone-600 focus:border-amber-500/40"
            />
          </label>
          <label className="flex w-full items-center gap-2 text-xs text-stone-400 md:flex-1">
            <span className="shrink-0">CEFR</span>
            <select
              value={cefrFilter}
              onChange={(event) => setCefrFilter(event.target.value as CEFRLevel | "all")}
              className="h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs text-stone-200 outline-none [color-scheme:dark] focus:border-amber-500/40"
            >
              <option value="all">All levels</option>
              {CEFR_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
            </select>
          </label>
          <label className="flex w-full items-center gap-2 text-xs text-stone-400 md:flex-1">
            <span className="shrink-0">Sort</span>
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as AssetSort)}
              className="h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs text-stone-200 outline-none [color-scheme:dark] focus:border-amber-500/40"
            >
              <option value="newest">Newest First</option>
              <option value="title">Title A-Z</option>
              <option value="category">Category</option>
            </select>
          </label>
          <div className="flex items-center justify-end gap-1 self-end md:self-auto" role="group" aria-label="Asset view">
            <button
              type="button"
              aria-label="Grid view"
              aria-pressed={view === "grid"}
              onClick={() => setView("grid")}
              className={`inline-flex h-10 w-10 items-center justify-center rounded-md border transition ${view === "grid" ? "border-amber-500/40 bg-amber-500/10 text-amber-300" : "border-border text-stone-400 hover:text-stone-200"}`}
            >
              <Grid2X2 className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="List view"
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
              className={`inline-flex h-10 w-10 items-center justify-center rounded-md border transition ${view === "list" ? "border-amber-500/40 bg-amber-500/10 text-amber-300" : "border-border text-stone-400 hover:text-stone-200"}`}
            >
              <List className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-48 items-center justify-center py-10 text-sm text-stone-400" role="status">Loading Resource Hub assets...</div>
        ) : filteredAssets.length === 0 ? (
          <div className="flex min-h-48 flex-col items-center justify-center py-10 text-center">
            <span className="rounded-xl border border-border bg-background p-3 text-stone-500">
              <FileText className="h-5 w-5" aria-hidden="true" />
            </span>
            <h4 className="mt-4 text-sm font-semibold text-stone-200">No assets found</h4>
            <p className="mt-2 max-w-md text-xs leading-relaxed text-stone-500">
              Try another search or filter, or add a new asset to this library.
            </p>
          </div>
        ) : view === "grid" ? (
          <div className="grid grid-cols-1 gap-4 pt-5 md:grid-cols-2 lg:grid-cols-3">
            {filteredAssets.map((asset) => (
              <article key={asset.id} className="flex min-w-0 flex-col rounded-xl border border-border bg-background/70 p-4">
                <div className="flex flex-wrap gap-1.5">
                  <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-300">{getCategoryLabel(asset.mainCategory)}</span>
                  <span className="rounded-full border border-border px-2 py-1 text-[10px] text-stone-400">{asset.subCategory}</span>
                  <span className="rounded-full border border-border px-2 py-1 text-[10px] text-stone-400">{asset.cefrLevel}</span>
                </div>
                <h4 className="mt-3 break-words text-sm font-semibold text-stone-100">{asset.title}</h4>
                <p className="mt-1 line-clamp-2 min-h-10 text-xs leading-relaxed text-stone-400">{asset.description || "No description provided."}</p>
                <div className="mt-3 flex min-h-6 flex-wrap gap-1.5">
                  {asset.tags.map((tag) => (
                    <span key={tag} className="rounded bg-white/5 px-1.5 py-1 text-[10px] text-stone-400">#{tag}</span>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
                  <span className="text-[10px] text-stone-500">{formatCreatedAt(asset.createdAt)}{asset.isDownloadable ? " · Downloadable" : ""}</span>
                  <div className="flex shrink-0 gap-2">
                    <button type="button" onClick={() => openPreview(asset.url)} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-[11px] text-stone-300 transition hover:border-amber-500/40 hover:text-amber-300">
                      Preview <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => setDeleteConfirmation({
                      title: `Delete ${asset.title}?`,
                      description: "This permanently deletes the Resource Hub asset. This action cannot be undone.",
                      onConfirm: () => deleteAsset(asset.id),
                    })} disabled={deletingAssetId === asset.id} aria-label={`Delete ${asset.title}`} className="inline-flex items-center justify-center rounded-md border border-border p-1.5 text-stone-400 transition hover:border-rose-500/40 hover:text-rose-300 disabled:cursor-wait disabled:opacity-50">
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto pt-4">
            <table className="w-full min-w-[680px] border-collapse text-left">
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-[0.12em] text-stone-500">
                  <th scope="col" className="px-3 py-3 font-medium">Asset</th>
                  <th scope="col" className="px-3 py-3 font-medium">Category</th>
                  <th scope="col" className="px-3 py-3 font-medium">Level</th>
                  <th scope="col" className="px-3 py-3 font-medium">Tags</th>
                  <th scope="col" className="px-3 py-3 font-medium">Created</th>
                  <th scope="col" className="px-3 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAssets.map((asset) => (
                  <tr key={asset.id} className="border-b border-border/70 text-xs text-stone-300 last:border-0">
                    <td className="max-w-xs px-3 py-3">
                      <span className="block truncate font-medium text-stone-100">{asset.title}</span>
                      {asset.description && <span className="mt-1 block truncate text-[11px] text-stone-500">{asset.description}</span>}
                    </td>
                    <td className="px-3 py-3">{getCategoryLabel(asset.mainCategory)} · {asset.subCategory}</td>
                    <td className="px-3 py-3">{asset.cefrLevel}</td>
                    <td className="max-w-48 px-3 py-3">
                      <span className="block truncate">{asset.tags.length ? asset.tags.join(", ") : "—"}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">{formatCreatedAt(asset.createdAt)}</td>
                    <td className="px-3 py-3">
                      <div className="flex gap-2">
                        <button type="button" onClick={() => openPreview(asset.url)} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-[11px] transition hover:border-amber-500/40 hover:text-amber-300">
                          Preview <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        </button>
                        <button type="button" onClick={() => setDeleteConfirmation({
                          title: `Delete ${asset.title}?`,
                          description: "This permanently deletes the Resource Hub asset. This action cannot be undone.",
                          onConfirm: () => deleteAsset(asset.id),
                        })} disabled={deletingAssetId === asset.id} aria-label={`Delete ${asset.title}`} className="inline-flex items-center justify-center rounded-md border border-border p-1.5 text-stone-400 transition hover:border-rose-500/40 hover:text-rose-300 disabled:cursor-wait disabled:opacity-50">
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isAddAssetOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsAddAssetOpen(false);
          }}
        >
          <section role="dialog" aria-modal="true" aria-labelledby="add-asset-title" className="my-auto w-full max-w-2xl rounded-xl border border-border bg-[#141a23] p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Resource Hub</p>
                <h3 id="add-asset-title" className="mt-1 text-xl font-semibold text-stone-100">Add Asset</h3>
              </div>
              <button type="button" onClick={() => setIsAddAssetOpen(false)} aria-label="Close add asset dialog" className="rounded-md p-2 text-stone-400 transition hover:bg-white/5 hover:text-stone-100">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={(event) => void handleCreateAsset(event)} className="mt-5 space-y-4">
              {actionError && <p role="alert" className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{actionError}</p>}
              <label className="block space-y-1.5 text-xs font-medium text-stone-400">
                Title <span className="text-rose-300">*</span>
                <input
                  required
                  maxLength={160}
                  value={assetDraft.title}
                  onChange={(event) => setAssetDraft((current) => ({ ...current, title: event.target.value }))}
                  className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-stone-200 outline-none focus:border-amber-500/40"
                  autoFocus
                />
              </label>
              <label className="block space-y-1.5 text-xs font-medium text-stone-400">
                Description
                <textarea
                  rows={3}
                  maxLength={1000}
                  value={assetDraft.description}
                  onChange={(event) => setAssetDraft((current) => ({ ...current, description: event.target.value }))}
                  className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm text-stone-200 outline-none focus:border-amber-500/40"
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-1.5 text-xs font-medium text-stone-400">
                  Main Category
                  <select
                    value={assetDraft.mainCategory}
                    onChange={(event) => handleMainCategoryChange(event.target.value as MainCategory)}
                    className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-stone-200 outline-none [color-scheme:dark] focus:border-amber-500/40"
                  >
                    {RESOURCE_CATEGORIES.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
                  </select>
                </label>
                <label className="block space-y-1.5 text-xs font-medium text-stone-400">
                  Sub Category
                  <select
                    value={assetDraft.subCategory}
                    onChange={(event) => setAssetDraft((current) => ({ ...current, subCategory: event.target.value as SubCategory }))}
                    className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-stone-200 outline-none [color-scheme:dark] focus:border-amber-500/40"
                  >
                    {RESOURCE_CATEGORIES.find(({ id }) => id === assetDraft.mainCategory)?.subCategories.map((subCategory) => (
                      <option key={subCategory} value={subCategory}>{subCategory}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-1.5 text-xs font-medium text-stone-400">
                  URL / Resource Link
                  <input
                    type="url"
                    required
                    value={assetDraft.url}
                    onChange={(event) => setAssetDraft((current) => ({ ...current, url: event.target.value }))}
                    placeholder="https://example.com/resource"
                    className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-stone-200 outline-none placeholder:text-stone-600 focus:border-amber-500/40"
                  />
                </label>
                <label className="block space-y-1.5 text-xs font-medium text-stone-400">
                  CEFR Level
                  <select
                    value={assetDraft.cefrLevel}
                    onChange={(event) => setAssetDraft((current) => ({ ...current, cefrLevel: event.target.value as CEFRLevel }))}
                    className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-stone-200 outline-none [color-scheme:dark] focus:border-amber-500/40"
                  >
                    {CEFR_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
                  </select>
                </label>
              </div>
              <label className="block space-y-1.5 text-xs font-medium text-stone-400">
                Tags
                <input
                  value={assetDraft.tags}
                  onChange={(event) => setAssetDraft((current) => ({ ...current, tags: event.target.value }))}
                  placeholder="e.g. grammar, listening, travel"
                  className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-stone-200 outline-none placeholder:text-stone-600 focus:border-amber-500/40"
                />
                <span className="block text-[10px] font-normal text-stone-500">Separate tags with commas.</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-stone-300">
                <input
                  type="checkbox"
                  checked={assetDraft.isDownloadable}
                  onChange={(event) => setAssetDraft((current) => ({ ...current, isDownloadable: event.target.checked }))}
                  className="h-4 w-4 accent-amber-500"
                />
                Allow Student Downloads
              </label>
              <div className="flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setIsAddAssetOpen(false)} className="h-10 rounded-md border border-border px-4 text-xs text-stone-300 transition hover:bg-white/5">
                  Cancel
                </button>
                <button type="submit" disabled={isSavingAsset} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-amber-500/20 px-4 text-xs text-amber-300 transition hover:bg-amber-500/30 disabled:cursor-wait disabled:opacity-50">
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  {isSavingAsset ? "Saving..." : "Save Asset"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {selectedCategory === "audios" && <MusicLibraryManager instructorId={instructorId} />}
      <DeleteConfirmationDialog request={deleteConfirmation} onCancel={() => setDeleteConfirmation(null)} />
    </section>
  );
}
