"use client";

import { useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { parseInteractiveTranscript } from "@/lib/transcripts";

interface InteractiveVideoBlockProps {
  videoUrl: string;
  title?: string;
  transcript?: string;
  transcriptLocked?: boolean;
  editable?: boolean;
  onTranscriptChange?: (value: string) => void;
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
    }
    if (!embedUrl) return "";

    const embed = new URL(embedUrl);
    embed.searchParams.set("enablejsapi", "1");
    embed.searchParams.set("origin", window.location.origin);
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
  onTranscriptChange,
}: InteractiveVideoBlockProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [isTranscriptExpanded, setIsTranscriptExpanded] = useState(false);
  const transcriptLines = parseInteractiveTranscript(transcript || "");
  const embedUrl = getVideoEmbedUrl(videoUrl);

  const seekToTimestamp = (seconds: number) => {
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: "command", func: "seekTo", args: [seconds, true] }),
      "*",
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
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : (
        <div className="rounded border border-dashed border-[#394252] p-4 text-xs text-stone-500">Video embed placeholder</div>
      )}

      {editable && (
        <textarea
          value={transcript || ""}
          onChange={(event) => onTranscriptChange?.(event.target.value)}
          placeholder="Paste timestamped transcript here, for example: 0:15 Welcome..."
          rows={4}
          className="max-h-48 w-full resize-y overflow-auto rounded border border-[#202631] bg-[#0c1017] p-2 text-xs text-stone-200 outline-none focus:border-amber-500"
          aria-label="Media Transcript (Optional)"
        />
      )}

      {!transcriptLocked && transcriptLines.length > 0 && (
        <div className="overflow-hidden rounded border border-[#202631] bg-[#0c1017]/50" aria-label="Interactive transcript">
          <button
            type="button"
            onClick={() => setIsTranscriptExpanded((expanded) => !expanded)}
            aria-expanded={isTranscriptExpanded}
            aria-controls="interactive-video-transcript"
            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-semibold text-stone-300 transition hover:bg-amber-500/10 hover:text-amber-200"
          >
            <span>Show / Hide Transcript</span>
            <ChevronDown className={`h-4 w-4 shrink-0 text-amber-400 transition-transform duration-200 ${isTranscriptExpanded ? "rotate-180" : ""}`} aria-hidden="true" />
          </button>
          <div
            id="interactive-video-transcript"
            className={`grid transition-[grid-template-rows] duration-300 ease-out ${isTranscriptExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
          >
            <div className="min-h-0 overflow-y-auto border-t border-[#202631]">
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
      )}
    </div>
  );
}