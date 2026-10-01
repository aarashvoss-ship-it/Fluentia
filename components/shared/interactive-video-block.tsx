"use client";

import { useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { parseInteractiveTranscript } from "@/lib/transcripts";

interface InteractiveVideoBlockProps {
  videoUrl: string;
  title?: string;
  transcript?: string;
  transcriptLocked?: boolean;
  editable?: boolean;
  showTranscript?: boolean;
}

function getVideoEmbedUrl(url: string) {
  try {
    const parsedUrl = new URL(url);
    let embedUrl = "";
    if (parsedUrl.hostname === "youtu.be") {
      embedUrl = `https://www.youtube.com/embed/${parsedUrl.pathname.slice(1)}`;
    } else if (parsedUrl.hostname.endsWith("youtube.com") && parsedUrl.pathname === "/watch") {
      const videoId = parsedUrl.searchParams.get("v");
      embedUrl = videoId ? `https://www.youtube.com/embed/${videoId}` : "";
    } else if (parsedUrl.hostname.endsWith("youtube.com") && parsedUrl.pathname.startsWith("/embed/")) {
      embedUrl = url;
    } else if (parsedUrl.hostname === "vimeo.com" || parsedUrl.hostname.endsWith(".vimeo.com")) {
      const videoId = parsedUrl.pathname.match(/^\/(?:video\/)?(\d+)/)?.[1];
      if (videoId) {
        const embed = new URL(`https://player.vimeo.com/video/${videoId}`);
        const privacyHash = parsedUrl.pathname.split("/").filter(Boolean).find((part) => part !== videoId && !/^\d+$/.test(part));
        if (privacyHash) embed.searchParams.set("h", privacyHash);
        embedUrl = embed.toString();
      }
    }
    if (!embedUrl) return "";

    const embed = new URL(embedUrl);
    embed.searchParams.set("enablejsapi", "1");
    embed.searchParams.set("origin", window.location.origin);
    embed.searchParams.set("widget_referrer", window.location.origin);
    embed.searchParams.set("playsinline", "1");
    embed.searchParams.set("rel", "0");
    return embed.toString();
  } catch {
    return "";
  }
}

export function InteractiveVideoBlock({
  videoUrl,
  title,
  transcript,
  transcriptLocked = false,
  editable = false,
  showTranscript = true,
}: InteractiveVideoBlockProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const loadedIframeSrcRef = useRef("");
  const [isTranscriptExpanded, setIsTranscriptExpanded] = useState(true);
  const transcriptId = useId();
  const transcriptLines = parseInteractiveTranscript(transcript || "");
  const embedUrl = getVideoEmbedUrl(videoUrl);
  const directVideoUrl = !embedUrl && /^https?:\/\//i.test(videoUrl.trim()) ? videoUrl.trim() : "";

  const seekToTimestamp = (seconds: number) => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow || loadedIframeSrcRef.current !== iframe.src) return;
    let targetOrigin: string;
    try {
      targetOrigin = new URL(iframe.src).origin;
    } catch {
      return;
    }
    if (targetOrigin !== "https://www.youtube.com") return;
    iframe.contentWindow.postMessage(
      JSON.stringify({ event: "command", func: "seekTo", args: [seconds, true] }),
      targetOrigin,
    );
  };

  return (
    <div className="space-y-3">
      {embedUrl ? (
        <div className="aspect-video overflow-hidden rounded border border-[#202631] bg-[#0c1017]">
          <iframe
            ref={iframeRef}
            src={embedUrl}
            title={title || "Lesson video"}
            className="h-full w-full"
            allow="autoplay; accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            onLoad={(event) => {
              loadedIframeSrcRef.current = event.currentTarget.src;
            }}
            allowFullScreen
          />
        </div>
      ) : directVideoUrl ? (
        <div className="overflow-hidden rounded border border-[#202631] bg-[#0c1017]">
          <video src={directVideoUrl} controls preload="metadata" className="max-h-[480px] w-full bg-black" aria-label={title || "Lesson video"} />
        </div>
      ) : editable ? (
        <div className="rounded border border-dashed border-[#394252] p-4 text-xs text-stone-500">Add a video URL to preview this block.</div>
      ) : null}

      {showTranscript && !transcriptLocked && transcriptLines.length > 0 && (
        <div className="rounded border border-[#202631] bg-[#0c1017]/50" aria-label="Interactive transcript">
          <button
            type="button"
            onClick={() => setIsTranscriptExpanded((expanded) => !expanded)}
            aria-expanded={isTranscriptExpanded}
            aria-controls={transcriptId}
            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-semibold text-stone-300 transition hover:bg-amber-500/10 hover:text-amber-200"
          >
            <span>Show / Hide Transcript</span>
            <ChevronDown className={`h-4 w-4 shrink-0 text-amber-400 transition-transform duration-200 ${isTranscriptExpanded ? "rotate-180" : ""}`} aria-hidden="true" />
          </button>
          <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${isTranscriptExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
            <div className="overflow-hidden">
              <div id={transcriptId} className="max-h-[350px] overflow-y-auto overscroll-contain border-t border-[#202631] scroll-smooth">
                <div className="space-y-1 p-2">
                  {transcriptLines.map((line) => (
                    <button
                      key={`${line.seconds}-${line.text}`}
                      type="button"
                      onClick={() => seekToTimestamp(line.seconds)}
                      className="flex w-full min-w-0 items-start gap-2 rounded px-2 py-1.5 text-left text-xs text-stone-300 transition hover:bg-amber-500/10 hover:text-amber-200"
                    >
                      <span className="shrink-0 rounded border border-amber-500/40 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-amber-300">{line.timestamp}</span>
                      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{line.text}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}