'use client'

import { useEffect } from "react";
import { reloadAfterChunkError } from "@/components/shared/chunk-error-recovery";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    reloadAfterChunkError(error);
  }, [error]);

  return (
    <div className="p-8 text-center">
      <h2 className="text-xl font-bold mb-4">Something went wrong!</h2>
      <button
        onClick={() => reset()}
        className="px-4 py-2 bg-amber-500/20 text-white rounded-md"
      >
        Try again
      </button>
    </div>
  )
}