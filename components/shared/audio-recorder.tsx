"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";

function fmt(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const sec = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
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
  const [levels, setLevels] = useState<number[]>(Array(24).fill(6));
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
    streamRef.current?.getTracks().forEach(t=>t.stop());
    streamRef.current = null;
  };

  useEffect(()=>()=>{ try{recRef.current?.state==="recording"&&recRef.current.stop();}catch{} stopAll(); },[]);

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = ["audio/webm;codecs=opus","audio/webm","audio/mp4","audio/ogg;codecs=opus"].find(t=>{try{return (MediaRecorder as unknown as {isTypeSupported?:(t:string)=>boolean}).isTypeSupported?.(t);}catch{return false;}}) || "";
      const r = new MediaRecorder(stream, mime?{mimeType:mime} as MediaRecorderOptions:undefined);
      chunks.current = [];
      r.ondataavailable = e=>{ if(e.data.size>0) chunks.current.push(e.data); };
      r.onstop = () => {
        const blob = new Blob(chunks.current, { type: r.mimeType || mime || "audio/webm" });
        stopAll(); setRec(false); setElapsed(0);
        onBlob(blob, r.mimeType || mime || "audio/webm");
      };
      r.onerror = () => { stopAll(); setRec(false); };
      recRef.current = r; r.start(100); setRec(true); startRef.current = Date.now();
      timerRef.current = setInterval(()=> setElapsed(Math.floor((Date.now()-startRef.current)/1000)), 200);
      // waveform via Web Audio → fallback to CSS pulse if unavailable
      try {
        const Ctx = (window.AudioContext|| (window as unknown as {webkitAudioContext: typeof AudioContext}).webkitAudioContext);
        const ctx = new Ctx(); ctxRef.current = ctx;
        const src = ctx.createMediaStreamSource(stream);
        const an = ctx.createAnalyser(); an.fftSize = 64; src.connect(an);
        const arr = new Uint8Array(an.frequencyBinCount);
        const tick = () => {
          an.getByteFrequencyData(arr);
          // map to 24 bars
          const bars = Array.from({length:24},(_,i)=> {
            const v = arr[Math.floor(i/24*arr.length)]||0;
            return Math.max(4, Math.min(28, 4 + v*0.09));
          });
          setLevels(bars);
          animRef.current = requestAnimationFrame(tick);
        };
        tick();
      } catch { /* css fallback keeps static bars */ }
    } catch { /* permission denied handled by caller */ }
  };

  const stop = () => { try{recRef.current?.state==="recording"&&recRef.current.stop();}catch{ stopAll(); setRec(false);} };

  if (rec) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-red-500/30 bg-[#0c1017] px-3 py-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500 animate-pulse" aria-hidden />
        <span className="text-xs font-mono text-red-300 tabular-nums">{fmt(elapsed)}</span>
        <div className="flex items-end gap-[2px] h-6" aria-hidden>{levels.map((h,i)=><span key={i} className="w-[3px] rounded-full bg-amber-400/80" style={{height:h}} />)}</div>
        <button type="button" onClick={stop} className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-red-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-400"><Square className="h-3 w-3 fill-current" />Stop</button>
      </div>
    );
  }
  return (
    <button type="button" onClick={start} disabled={disabled} className="inline-flex items-center gap-1.5 rounded-md border border-amber-500 px-3 py-2 text-xs font-semibold text-amber-400 hover:bg-amber-500 hover:text-black disabled:opacity-40">
      <Mic className="h-3.5 w-3.5" />{label}
    </button>
  );
}
