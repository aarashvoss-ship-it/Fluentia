"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export const CHUNK_ERROR_RELOAD_KEY = "fluentia:chunk-error-reloaded";

export function isChunkLoadError(error: Error) {
  return /ChunkLoadError|Loading chunk/i.test(`${error.name} ${error.message}`);
}

export function reloadAfterChunkError(error: Error) {
  if (!isChunkLoadError(error) || typeof window === "undefined") return false;

  try {
    if (window.sessionStorage.getItem(CHUNK_ERROR_RELOAD_KEY)) return false;
    window.sessionStorage.setItem(CHUNK_ERROR_RELOAD_KEY, "1");
    window.location.reload();
    return true;
  } catch {
    return false;
  }
}

export function ChunkErrorRecoveryReset() {
  const pathname = usePathname();

  useEffect(() => {
    const resetTimer = window.setTimeout(() => {
      try {
        window.sessionStorage.removeItem(CHUNK_ERROR_RELOAD_KEY);
      } catch {
        // Session storage may be disabled by the browser.
      }
    }, 10_000);

    return () => window.clearTimeout(resetTimer);
  }, [pathname]);

  return null;
}
