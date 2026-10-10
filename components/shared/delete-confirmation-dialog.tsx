"use client";

import { useEffect, useState } from "react";

export interface DeleteConfirmationRequest {
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
}

interface DeleteConfirmationDialogProps {
  request: DeleteConfirmationRequest | null;
  onCancel: () => void;
}

export function DeleteConfirmationDialog({ request, onCancel }: DeleteConfirmationDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setIsDeleting(false);
    setError("");
  }, [request]);

  if (!request) return null;

  const confirmDelete = async () => {
    setIsDeleting(true);
    setError("");
    try {
      await request.onConfirm();
      onCancel();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "The item could not be deleted. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4" role="presentation">
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-confirmation-title"
        aria-describedby="delete-confirmation-description"
        className="w-full max-w-md rounded-xl border border-red-500/30 bg-surface p-6 shadow-2xl"
      >
        <h2 id="delete-confirmation-title" className="font-sans text-lg font-semibold text-stone-100">{request.title}</h2>
        <p id="delete-confirmation-description" className="mt-3 text-sm leading-relaxed text-stone-300">{request.description}</p>
        {error && <p role="alert" className="mt-3 text-xs text-red-300">{error}</p>}
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" disabled={isDeleting} onClick={onCancel} className="rounded-md border border-border px-4 py-2 text-xs text-stone-300 hover:border-stone-300 disabled:cursor-not-allowed disabled:opacity-50">
            Cancel
          </button>
          <button type="button" disabled={isDeleting} onClick={() => void confirmDelete()} className="rounded-md bg-red-500 px-4 py-2 text-xs text-white hover:bg-red-400 disabled:cursor-wait disabled:opacity-60">
            {isDeleting ? "Deleting..." : request.confirmLabel || "Delete"}
          </button>
        </div>
      </section>
    </div>
  );
}
