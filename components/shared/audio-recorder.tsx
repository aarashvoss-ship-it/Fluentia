"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";

function fmt(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const sec = Math.floor(s % 60).toString().padStart(2, "0");
  const cs = Math.floor((s % 1) * 100).toString().padStart(2, "0");
  return `${m}:${sec}.${cs}`;
}
function fmtInt(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const sec = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${sec}.00`;
}

export function AudioRecorder({
  onBlob,
  disabled,
  label = "Record",
}: {
  onBlob: (blob: Blob, mime: string) => void;
  disabled?: boolean;
  label?: string;
}) {
  const [rec, setRec] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState<number[]>(Array(48).fill(3));
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const animRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startRef = useRef(0);

  const stopAll = () => {
    cancelAnimationFrame(animRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    try { ctxRef.current?.close(); } catch {}
    ctxRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  useEffect(
    () => () => {
      try {
        recRef.current?.state === "recording" && recRef.current.stop();
      } catch {}
      stopAll();
    },
    []
  );

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime =
        ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((t) => {
          try {
            return (MediaRecorder as unknown as { isTypeSupported?: (t: string) => boolean }).isTypeSupported?.(t);
          } catch {
            return false;
          }
        }) || "";
      const r = new MediaRecorder(stream, mime ? ({ mimeType: mime } as MediaRecorderOptions) : undefined);
      chunks.current = [];
      r.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data);
      };
      r.onstop = () => {
        const blob = new Blob(chunks.current, { type: r.mimeType || mime || "audio/webm" });
        stopAll();
        setRec(false);
        setElapsed(0);
        onBlob(blob, r.mimeType || mime || "audio/webm");
      };
      r.onerror = () => {
        stopAll();
        setRec(false);
      };
      recRef.current = r;
      r.start(100);
      setRec(true);
      startRef.current = Date.now();
      timerRef.current = setInterval(() => setElapsed((Date.now() - startRef.current) / 1000), 80);
      try {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new Ctx();
        ctxRef.current = ctx;
        const src = ctx.createMediaStreamSource(stream);
        const an = ctx.createAnalyser();
        an.fftSize = 128;
        src.connect(an);
        const arr = new Uint8Array(an.frequencyBinCount);
        const tick = () => {
          an.getByteFrequencyData(arr);
          const bars = Array.from({ length: 48 }, (_, i) => {
            const v = arr[Math.floor((i / 48) * arr.length)] || 0;
              return Math.max(1, Math.min(8, 1 + v * 0.03));
          });
          setLevels(bars);
          animRef.current = requestAnimationFrame(tick);
        };
        tick();
      } catch {}
    } catch {}
  };

  const stop = () => {
    try {
      recRef.current?.state === "recording" && recRef.current.stop();
    } catch {
      stopAll();
      setRec(false);
    }
  };

  if (rec) {
    return (
      <div className="flex w-full min-w-0 items-center gap-3 rounded-lg border border-[#202631] bg-[#111620] px-3 py-2.5">
        {/* Circular stop button */}
        <button
          type="button"
          onClick={stop}
          aria-label="Stop recording"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-500 text-white shadow-sm transition hover:bg-red-400 active:scale-95"
        >
          <Square className="h-3.5 w-3.5 fill-current" />
        </button>
        {/* Waveform timeline */}
        <div className="flex flex-1 items-center justify-center gap-px overflow-hidden" aria-hidden>
          {levels.map((h, i) => (
            <span key={i} className="w-px shrink-0 rounded-full bg-stone-400/70" style={{ height: h }} />
          ))}
        </div>
        {/* Timer */}
        <span className="shrink-0 font-mono text-xs tabular-nums text-stone-300">{fmt(elapsed)}</span>
      </div>
    );
  }

  // Idle — single circular record button + timer placeholder + waveform placeholder
  return (
    <div className="flex w-full min-w-0 items-center gap-3 rounded-lg border border-[#202631] bg-[#111620] px-3 py-2.5">
      <button
        type="button"
        onClick={start}
        disabled={disabled}
        aria-label={label}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500 text-[#0c1017] shadow-sm transition hover:bg-amber-400 active:scale-95 disabled:opacity-40"
      >
        <Mic className="h-4 w-4" />
      </button>
      <div className="flex flex-1 items-center justify-center" aria-hidden>
        <span className="h-px w-full max-w-[220px] rounded bg-[#202631]" />
      </div>
      <span className="shrink-0 font-mono text-xs tabular-nums text-stone-500">{fmtInt(0)}</span>
    </div>
  );
}
