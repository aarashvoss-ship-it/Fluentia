"use client";

import { BookOpen, FileText, Film, Headphones, PackageOpen } from "lucide-react";
import { useState } from "react";
import type { MainCategory } from "@/types/resource-hub";

const RESOURCE_CATEGORIES: {
  id: MainCategory;
  label: string;
  description: string;
  subCategories: string[];
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
    subCategories: ["Audiobooks", "Podcasts", "Songs", "Instrumental"],
    icon: Headphones,
  },
  {
    id: "others",
    label: "Others",
    description: "Everything else for your classes",
    subCategories: ["General"],
    icon: PackageOpen,
  },
];

export function ResourceHubPage() {
  const [selectedCategory, setSelectedCategory] = useState<MainCategory | null>(null);
  const selectedCategoryDetails = RESOURCE_CATEGORIES.find(({ id }) => id === selectedCategory);

  return (
    <section className="mx-auto w-full min-w-0 max-w-6xl space-y-6" aria-labelledby="resource-hub-title">
      <div className="rounded-2xl border border-border bg-surface/60 p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-400">Teaching Materials</p>
            <h2 id="resource-hub-title" className="mt-1 font-sans text-2xl font-semibold text-stone-100">Resource Hub</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-400">
              Organize shared documents, videos, audio, and other materials for your classes.
            </p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs text-stone-300">
            <BookOpen className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
            Resource library
          </span>
        </div>
      </div>

      <div>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-stone-100">Browse categories</h3>
            <p className="mt-1 text-xs text-stone-500">Choose a category to see its resource types.</p>
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
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
              {selectedCategoryDetails
                ? `Browse ${selectedCategoryDetails.label.toLowerCase()} in your shared library.`
                : "Your shared teaching materials will appear here."}
            </p>
          </div>
          <span className="rounded-full border border-border px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-stone-400">
            0 assets
          </span>
        </div>

        {selectedCategoryDetails && (
          <div className="flex flex-wrap gap-2 py-4" aria-label={`${selectedCategoryDetails.label} resource types`}>
            {selectedCategoryDetails.subCategories.map((subCategory) => (
              <span key={subCategory} className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-stone-300">
                {subCategory}
              </span>
            ))}
          </div>
        )}

        <div className="flex min-h-56 flex-col items-center justify-center py-10 text-center">
          <span className="rounded-xl border border-border bg-background p-3 text-stone-500">
            <FileText className="h-5 w-5" aria-hidden="true" />
          </span>
          <h4 className="mt-4 text-sm font-semibold text-stone-200">Your resource library is ready</h4>
          <p className="mt-2 max-w-md text-xs leading-relaxed text-stone-500">
            Asset upload, editing, and student access controls will be added in a later phase.
          </p>
        </div>
      </div>
    </section>
  );
}
