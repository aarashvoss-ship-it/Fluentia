"use client";

import { useEffect, useRef, useState } from "react";

interface YoutubePlayer {
  destroy(): void;
  getIframe(): HTMLIFrameElement;
  pauseVideo(): void;
  playVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setVolume(volume: number): void;
}

interface YoutubeApi {
  Player: new (element: HTMLElement, options: {
    height: string;
    width: string;
    videoId: string;
    playerVars: Record<string, number | string>;
    events: {
      onReady: (event: { target?: YoutubePlayer } | null) => void;
      onStateChange: (event: { target?: YoutubePlayer; data?: number } | null) => void;
        onError: (event: { target?: YoutubePlayer; data?: number } | null) => void;
    };
  }) => YoutubePlayer;
}

declare global {
  interface Window {
    YT?: YoutubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youtubeApiPromise: Promise<YoutubeApi> | null = null;

function loadYoutubeApi(): Promise<YoutubeApi> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise<YoutubeApi>((resolve, reject) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    const timeout = window.setTimeout(() => reject(new Error("YouTube player API timed out.")), 15000);
    window.onYouTubeIframeAPIReady = () => {
      try {
        previousReady?.();
      } catch {
        // A third-party callback should not prevent this API from resolving.
      }
      window.clearTimeout(timeout);
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error("YouTube player API failed to initialize."));
    };

    let script = document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]');
    if (!script) {
      script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.onerror = () => {
        window.clearTimeout(timeout);
        youtubeApiPromise = null;
        reject(new Error("YouTube player API could not be loaded."));
      };
      document.head.appendChild(script);
    }
  }).catch((error: unknown) => {
    youtubeApiPromise = null;
    throw error;
  });

  return youtubeApiPromise;
}

function hasMatchingPlayerOrigin(player: YoutubePlayer): boolean {
  try {
    const iframe = player.getIframe();
    const iframeUrl = new URL(iframe.src);
    return Boolean(iframe.contentWindow)
      && iframeUrl.searchParams.get("enablejsapi") === "1"
      && iframeUrl.searchParams.get("origin") === window.location.origin;
  } catch {
    return false;
  }
}

interface YoutubeAudioControllerProps {
  videoId: string;
  isPlaying: boolean;
  volume: number;
  onError?: (errorCode?: number) => void;
}

export function YoutubeAudioController({ videoId, isPlaying, volume, onError }: YoutubeAudioControllerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YoutubePlayer | null>(null);
  const [isReady, setIsReady] = useState(false);
  const isPlayingRef = useRef(isPlaying);
  const volumeRef = useRef(volume);
  const onErrorRef = useRef(onError);
  isPlayingRef.current = isPlaying;
  volumeRef.current = volume;
  onErrorRef.current = onError;

  useEffect(() => {
    let cancelled = false;
    let playerReady = false;
    let timedOut = false;
    let errorReported = false;
    let readyTimer = 0;
    const reportError = (errorCode?: number) => {
      if (cancelled || errorReported) return;
      errorReported = true;
      onErrorRef.current?.(errorCode);
    };
    setIsReady(false);
    const host = hostRef.current;
    if (!host) return;
    const mount = document.createElement("div");
    host.replaceChildren(mount);

    void loadYoutubeApi().then((api) => {
      if (cancelled) return;
      readyTimer = window.setTimeout(() => {
        if (cancelled || playerReady) return;
        timedOut = true;
        const player = playerRef.current;
        playerRef.current = null;
        player?.destroy();
        reportError();
      }, 3000);
      const player = new api.Player(mount, {
        height: "200",
        width: "200",
        videoId,
        playerVars: {
          autoplay: isPlayingRef.current ? 1 : 0,
          controls: 0,
          disablekb: 1,
          enablejsapi: 1,
          fs: 0,
          loop: 1,
          origin: window.location.origin,
          playlist: videoId,
          playsinline: 1,
          rel: 0,
          widget_referrer: window.location.origin,
        },
        events: {
          onReady: (event) => {
            window.clearTimeout(readyTimer);
            playerReady = true;
            const target = event?.target;
            if (!target) {
              reportError();
              return;
            }
            if (cancelled || timedOut) {
              target.destroy();
              return;
            }
            if (!hasMatchingPlayerOrigin(target)) {
              target.destroy();
              playerRef.current = null;
              reportError();
              return;
            }
            const iframe = target.getIframe();
            iframe.width = "200";
            iframe.height = "200";
            iframe.allow = "autoplay; encrypted-media; picture-in-picture";
            iframe.tabIndex = -1;
            iframe.setAttribute("aria-hidden", "true");
            playerRef.current = target;
            target.setVolume(Math.round(volumeRef.current * 100));
            if (isPlayingRef.current) target.playVideo();
            else target.pauseVideo();
            setIsReady(true);
          },
          onStateChange: (event) => {
            const target = event?.target;
            if (cancelled || !target || target !== playerRef.current || !hasMatchingPlayerOrigin(target)) return;
            if (event?.data === 0 && isPlayingRef.current) {
              target.seekTo(0, true);
              target.playVideo();
            }
          },
          onError: (event) => {
            window.clearTimeout(readyTimer);
            if (event?.target && playerRef.current === event.target) {
              playerRef.current = null;
              event.target.destroy();
            }
            reportError(event?.data);
          },
        },
      });
      playerRef.current = player;
      const iframe = player.getIframe();
      iframe.width = "200";
      iframe.height = "200";
      iframe.allow = "autoplay; encrypted-media; picture-in-picture";
    }).catch(() => {
      reportError();
    });

    return () => {
      cancelled = true;
      window.clearTimeout(readyTimer);
      playerRef.current?.destroy();
      playerRef.current = null;
      host.replaceChildren();
    };
  }, [videoId]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !isReady) return;
    player.setVolume(Math.round(volume * 100));
    if (isPlaying) player.playVideo();
    else player.pauseVideo();
  }, [isPlaying, isReady, volume]);

  return <div ref={hostRef} aria-hidden="true" className="pointer-events-none absolute left-[-10000px] top-0 h-[200px] w-[200px] overflow-hidden opacity-0" />;
}