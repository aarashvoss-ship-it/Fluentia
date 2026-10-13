"use client";

import { useState } from "react";
import type { LessonResource } from "@/types/lesson";
import type { LessonAssignmentResourceOptions } from "@/lib/lessons";

export type LessonAssignmentCustomResourceDraft = {
  id: string;
  title: string;
  kind: "url" | "note" | "file";
  url: string;
  note: string;
  file: File | null;
};

export function LessonAssignmentResourceDialog({
  lessonTitle,
  targetLabel,
  resources,
  isSaving,
  error,
  onCancel,
  onAssign,
}: {
  lessonTitle: string;
  targetLabel: string;
  resources: LessonResource[];
  isSaving: boolean;
  error: string | null;
  onCancel: () => void;
  onAssign: (options: LessonAssignmentResourceOptions, customResources: LessonAssignmentCustomResourceDraft[]) => void;
}) {
  const [resourceMode, setResourceMode] = useState<"all" | "selected">("all");
  const [selectedResourceIds, setSelectedResourceIds] = useState(() => new Set(resources.map((resource) => resource.id)));
  const [customResources, setCustomResources] = useState<LessonAssignmentCustomResourceDraft[]>([]);
  const [customDraft, setCustomDraft] = useState<Omit<LessonAssignmentCustomResourceDraft, "id">>({
    title: "",
    kind: "url",
    url: "",
    note: "",
    file: null,
  });
  const [draftError, setDraftError] = useState<string | null>(null);

  const addCustomResource = () => {
    const title = customDraft.title.trim();
    if (!title) {
      setDraftError("Enter a title for the custom resource.");
      return;
    }
    if (customDraft.kind === "url" && !customDraft.url.trim()) {
      setDraftError("Enter a URL for the custom resource.");
      return;
    }
    if (customDraft.kind === "file" && !customDraft.file) {
      setDraftError("Choose a file to attach.");
      return;
    }
    if (customDraft.kind === "note" && !customDraft.note.trim()) {
      setDraftError("Enter the note for the student.");
      return;
    }
    setCustomResources((current) => [...current, { ...customDraft, id: crypto.randomUUID(), title }]);
    setCustomDraft({ title: "", kind: customDraft.kind, url: "", note: "", file: null });
    setDraftError(null);
  };

  const assign = () => {
    onAssign({
      resourceIds: resourceMode === "all"
        ? resources.map((resource) => resource.id)
        : [...selectedResourceIds],
    }, customResources);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !isSaving) onCancel();
    }}>
      <section className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-surface p-5 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="lesson-assignment-resources-title">
        <h2 id="lesson-assignment-resources-title" className="text-lg font-semibold text-stone-100">Assign lesson resources</h2>
        <p className="mt-1 text-sm text-stone-400"><span className="text-stone-200">{lessonTitle}</span> to {targetLabel}</p>

        <fieldset className="mt-5 space-y-2">
          <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">Lesson resource pool</legend>
          <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-3 text-sm text-stone-200">
            <input type="radio" name="lesson-resource-mode" checked={resourceMode === "all"} onChange={() => setResourceMode("all")} className="mt-0.5 accent-amber-500" />
            <span><span className="block font-medium">Assign with all original lesson resources</span><span className="mt-0.5 block text-xs text-stone-500">Includes all {resources.length} resources attached to this lesson.</span></span>
          </label>
          <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-3 text-sm text-stone-200">
            <input type="radio" name="lesson-resource-mode" checked={resourceMode === "selected"} onChange={() => setResourceMode("selected")} className="mt-0.5 accent-amber-500" />
            <span><span className="block font-medium">Assign with selected resources</span><span className="mt-0.5 block text-xs text-stone-500">Choose which resources from the lesson pool to include.</span></span>
          </label>
        </fieldset>

        {resourceMode === "selected" && (
          <div className="mt-3 max-h-48 space-y-1 overflow-y-auto rounded-md border border-border p-2">
            {resources.length === 0
              ? <p className="p-2 text-xs text-stone-500">This lesson has no resources in its pool.</p>
              : resources.map((resource) => (
                <label key={resource.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-xs text-stone-300 hover:bg-background">
                  <input type="checkbox" checked={selectedResourceIds.has(resource.id)} onChange={() => setSelectedResourceIds((current) => {
                    const next = new Set(current);
                    if (next.has(resource.id)) next.delete(resource.id);
                    else next.add(resource.id);
                    return next;
                  })} className="accent-amber-500" />
                  <span className="min-w-0 flex-1 truncate">{resource.title}</span>
                  <span className="text-stone-500">{resource.type}</span>
                </label>
              ))}
          </div>
        )}

        <div className="mt-5 rounded-lg border border-border p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-300">Additional custom resources</h3>
          <p className="mt-1 text-xs text-stone-500">These are added on top of the selected lesson resources and are private to each assigned student.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <label className="text-xs text-stone-400">Resource title
              <input value={customDraft.title} onChange={(event) => setCustomDraft((current) => ({ ...current, title: event.target.value }))} className="mt-1 w-full rounded border border-border bg-background p-2 text-xs text-stone-200" />
            </label>
            <label className="text-xs text-stone-400">Resource type
              <select value={customDraft.kind} onChange={(event) => setCustomDraft((current) => ({ ...current, kind: event.target.value as typeof current.kind, url: "", note: "", file: null }))} className="mt-1 w-full rounded border border-border bg-background p-2 text-xs text-stone-200 [color-scheme:dark]">
                <option value="url">URL</option>
                <option value="note">Note</option>
                <option value="file">File</option>
              </select>
            </label>
            {customDraft.kind === "url" && <label className="text-xs text-stone-400 sm:col-span-2">URL
              <input type="url" value={customDraft.url} onChange={(event) => setCustomDraft((current) => ({ ...current, url: event.target.value }))} placeholder="https://..." className="mt-1 w-full rounded border border-border bg-background p-2 text-xs text-stone-200" />
            </label>}
            {customDraft.kind === "note" && <label className="text-xs text-stone-400 sm:col-span-2">Note
              <textarea value={customDraft.note} onChange={(event) => setCustomDraft((current) => ({ ...current, note: event.target.value }))} rows={3} className="mt-1 w-full rounded border border-border bg-background p-2 text-xs text-stone-200" />
            </label>}
            {customDraft.kind === "file" && <label className="text-xs text-stone-400 sm:col-span-2">File
              <input type="file" onChange={(event) => setCustomDraft((current) => ({ ...current, file: event.target.files?.[0] || null }))} className="mt-1 block w-full text-xs text-stone-300 file:mr-3 file:rounded file:border-0 file:bg-amber-500/20 file:px-3 file:py-2 file:text-xs file:text-amber-300" />
            </label>}
            <button type="button" onClick={addCustomResource} className="justify-self-start rounded border border-amber-500/40 px-3 py-2 text-xs text-amber-300 hover:bg-amber-500/10">Add custom resource</button>
          </div>
          {(draftError || error) && <p role="alert" className="mt-2 text-xs text-red-300">{draftError || error}</p>}
          {customResources.length > 0 && <ul className="mt-3 divide-y divide-border rounded border border-border">
            {customResources.map((resource) => <li key={resource.id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs text-stone-300">
              <span className="min-w-0 truncate">{resource.title} <span className="text-stone-500">({resource.kind})</span></span>
              <button type="button" onClick={() => setCustomResources((current) => current.filter((item) => item.id !== resource.id))} aria-label={`Remove ${resource.title}`} className="text-stone-500 hover:text-red-300">Remove</button>
            </li>)}
          </ul>}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" disabled={isSaving} onClick={onCancel} className="rounded border border-border px-4 py-2 text-xs text-stone-300 disabled:opacity-50">Cancel</button>
          <button type="button" disabled={isSaving} onClick={assign} className="rounded bg-amber-500/20 px-4 py-2 text-xs font-medium text-amber-300 disabled:opacity-50">{isSaving ? "Assigning..." : "Assign Lesson"}</button>
        </div>
      </section>
    </div>
  );
}
