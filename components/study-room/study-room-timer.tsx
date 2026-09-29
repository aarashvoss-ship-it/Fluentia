"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, Timer, X } from "lucide-react";

const TIMER_STORAGE_KEY = "fluentia:study-room-timer";
const POMODORO_BREAK_EVENT = "fluentia:study-room-timer-break-start";
const POMODORO_FOCUS_EVENT = "fluentia:study-room-timer-focus-start";

type TimerMode = "pomodoro" | "countdown" | "stopwatch";
type TimerPhase = "focus" | "break";
type PomodoroPreset = "classic" | "extended" | "custom";

interface TimerState {
  mode: TimerMode;
  phase: TimerPhase;
  running: boolean;
  remainingSeconds: number;
  endsAt: number | null;
  elapsedSeconds: number;
  startedAt: number | null;
  focusMinutes: number;
  breakMinutes: number;
  pomodoroPreset: PomodoroPreset;
  countdownMinutes: number;
  countdownSeconds: number;
}

const DEFAULT_TIMER: TimerState = {
  mode: "pomodoro",
  phase: "focus",
  running: false,
  remainingSeconds: 25 * 60,
  endsAt: null,
  elapsedSeconds: 0,
  startedAt: null,
  focusMinutes: 25,
  breakMinutes: 5,
  pomodoroPreset: "classic",
  countdownMinutes: 15,
  countdownSeconds: 0,
};

function formatTime(totalSeconds: number, showHours = false) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  if (showHours || hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function playCompletionChime() {
  try {
    const AudioContextConstructor = window.AudioContext;
    if (!AudioContextConstructor) return;
    const context = new AudioContextConstructor();
    const startAt = context.currentTime;
    [659.25, 880].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const noteStart = startAt + index * 0.18;
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, noteStart);
      gain.gain.exponentialRampToValueAtTime(0.12, noteStart + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.48);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(noteStart);
      oscillator.stop(noteStart + 0.5);
    });
    window.setTimeout(() => void context.close(), 1200);
  } catch {
    // Timer state remains usable when Web Audio is unavailable.
  }
}

function isTimerState(value: unknown): value is TimerState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<TimerState>;
  return (candidate.mode === "pomodoro" || candidate.mode === "countdown" || candidate.mode === "stopwatch")
    && (candidate.phase === "focus" || candidate.phase === "break")
    && typeof candidate.running === "boolean"
    && typeof candidate.remainingSeconds === "number"
    && typeof candidate.elapsedSeconds === "number";
}

export function StudyRoomTimer() {
  const [timer, setTimer] = useState<TimerState>(DEFAULT_TIMER);
  const [now, setNow] = useState(Date.now());
  const [hydrated, setHydrated] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const handledEndAtRef = useRef<number | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(TIMER_STORAGE_KEY);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (isTimerState(parsed)) {
          setTimer({
            ...DEFAULT_TIMER,
            ...parsed,
            focusMinutes: Math.min(240, Math.max(1, parsed.focusMinutes || 25)),
            breakMinutes: Math.min(120, Math.max(1, parsed.breakMinutes || 5)),
            countdownMinutes: Math.min(999, Math.max(0, parsed.countdownMinutes || 0)),
            countdownSeconds: Math.min(59, Math.max(0, parsed.countdownSeconds || 0)),
          });
        }
      }
    } catch {
      // A malformed saved timer starts from the default settings.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(timer));
    } catch {
      setNotice("Timer settings could not be saved in this browser.");
    }
  }, [timer, hydrated]);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !panelRef.current?.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [isOpen]);

  useEffect(() => {
    if (!hydrated || !timer.running) return;
    const interval = window.setInterval(() => {
      const timestamp = Date.now();
      setNow(timestamp);
      if (timer.mode === "stopwatch" || !timer.endsAt || timestamp < timer.endsAt) return;
      if (handledEndAtRef.current === timer.endsAt) return;
      handledEndAtRef.current = timer.endsAt;
      playCompletionChime();
      if (timer.mode === "pomodoro") {
        const nextPhase = timer.phase === "focus" ? "break" : "focus";
        const nextDuration = (nextPhase === "focus" ? timer.focusMinutes : timer.breakMinutes) * 60;
        setTimer((current) => current.endsAt === timer.endsAt
          ? {
              ...current,
              phase: nextPhase,
              remainingSeconds: nextDuration,
              endsAt: timestamp + nextDuration * 1000,
            }
          : current);
        setNotice(nextPhase === "break" ? "Focus complete. Break time." : "Break complete. Focus time.");
        window.dispatchEvent(new Event(nextPhase === "break" ? POMODORO_BREAK_EVENT : POMODORO_FOCUS_EVENT));
      } else {
        setTimer((current) => current.endsAt === timer.endsAt
          ? { ...current, running: false, remainingSeconds: 0, endsAt: null }
          : current);
        setNotice("Countdown complete.");
      }
    }, 250);
    return () => window.clearInterval(interval);
  }, [hydrated, timer.running, timer.mode, timer.phase, timer.endsAt, timer.focusMinutes, timer.breakMinutes]);

  const remainingSeconds = timer.running && timer.mode !== "stopwatch" && timer.endsAt
    ? Math.max(0, Math.ceil((timer.endsAt - now) / 1000))
    : timer.remainingSeconds;
  const stopwatchSeconds = timer.elapsedSeconds + (timer.running && timer.startedAt
    ? Math.max(0, Math.floor((now - timer.startedAt) / 1000))
    : 0);
  const displayedSeconds = timer.mode === "stopwatch" ? stopwatchSeconds : remainingSeconds;
  const pomoDuration = (timer.phase === "focus" ? timer.focusMinutes : timer.breakMinutes) * 60;
  const countdownDuration = timer.countdownMinutes * 60 + timer.countdownSeconds;

  function changeMode(mode: TimerMode) {
    const duration = mode === "countdown" ? countdownDuration : timer.focusMinutes * 60;
    setTimer((current) => ({
      ...current,
      mode,
      phase: "focus",
      running: false,
      remainingSeconds: duration,
      endsAt: null,
      elapsedSeconds: 0,
      startedAt: null,
    }));
    setNotice("");
  }

  function startPauseTimer() {
    setNotice("");
    if (timer.running) {
      if (timer.mode === "stopwatch") {
        setTimer((current) => ({
          ...current,
          running: false,
          elapsedSeconds: stopwatchSeconds,
          startedAt: null,
        }));
      } else {
        setTimer((current) => ({
          ...current,
          running: false,
          remainingSeconds,
          endsAt: null,
        }));
      }
      return;
    }

    if (timer.mode === "stopwatch") {
      setTimer((current) => ({ ...current, running: true, startedAt: Date.now() }));
      return;
    }

    const configuredDuration = timer.mode === "pomodoro" ? pomoDuration : countdownDuration;
    const duration = remainingSeconds > 0 ? remainingSeconds : configuredDuration;
    if (duration <= 0) {
      setNotice("Set a duration greater than zero to start the timer.");
      return;
    }
    setTimer((current) => ({
      ...current,
      running: true,
      remainingSeconds: duration,
      endsAt: Date.now() + duration * 1000,
    }));
  }

  function resetTimer() {
    const duration = timer.mode === "countdown" ? countdownDuration : timer.focusMinutes * 60;
    setTimer((current) => ({
      ...current,
      phase: "focus",
      running: false,
      remainingSeconds: duration,
      endsAt: null,
      elapsedSeconds: 0,
      startedAt: null,
    }));
    setNotice("");
  }

  function setPomodoroPreset(preset: PomodoroPreset) {
    const durations = preset === "classic"
      ? { focusMinutes: 25, breakMinutes: 5 }
      : preset === "extended"
        ? { focusMinutes: 50, breakMinutes: 10 }
        : { focusMinutes: timer.focusMinutes, breakMinutes: timer.breakMinutes };
    setTimer((current) => ({
      ...current,
      ...durations,
      pomodoroPreset: preset,
      phase: "focus",
      running: false,
      remainingSeconds: durations.focusMinutes * 60,
      endsAt: null,
    }));
    setNotice("");
  }

  function setCountdownPreset(minutes: number) {
    setTimer((current) => ({
      ...current,
      countdownMinutes: minutes,
      countdownSeconds: 0,
      running: false,
      remainingSeconds: minutes * 60,
      endsAt: null,
    }));
    setNotice("");
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-label={`Open study timer, ${formatTime(displayedSeconds, timer.mode === "stopwatch")}`}
        aria-expanded={isOpen}
        className="flex h-8 items-center gap-1.5 rounded-md border border-[#394252] bg-[#171d28]/90 px-2 text-xs text-amber-300 transition hover:border-amber-500/60"
      >
        <Timer className="h-3.5 w-3.5" />
        <span className="font-mono tabular-nums">{formatTime(displayedSeconds, timer.mode === "stopwatch")}</span>
      </button>
      {isOpen && (
        <section className="absolute right-0 top-full z-50 mt-2 w-[min(21rem,calc(100vw-2rem))] rounded-lg border border-[#394252] bg-[#171d28] p-4 text-stone-200 shadow-2xl" aria-label="Study room timer">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Study Timer</p>
              <p className="mt-1 font-mono text-3xl font-semibold tabular-nums text-stone-100">{formatTime(displayedSeconds, timer.mode === "stopwatch")}</p>
              {timer.mode === "pomodoro" && <p className={`mt-1 text-xs font-medium ${timer.phase === "focus" ? "text-amber-300" : "text-emerald-300"}`}>{timer.phase === "focus" ? "Focusing" : "On Break"}</p>}
            </div>
            <button type="button" aria-label="Close study timer" onClick={() => setIsOpen(false)} className="rounded p-1 text-stone-500 hover:bg-white/5 hover:text-stone-200"><X className="h-4 w-4" /></button>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-1 rounded-md border border-[#29303c] bg-[#0c1017] p-1" role="group" aria-label="Timer mode">
            {(["pomodoro", "countdown", "stopwatch"] as const).map((mode) => (
              <button key={mode} type="button" aria-pressed={timer.mode === mode} onClick={() => changeMode(mode)} className={`rounded px-2 py-1.5 text-[10px] font-semibold capitalize ${timer.mode === mode ? "bg-amber-500 text-slate-950" : "text-stone-400 hover:text-stone-200"}`}>{mode}</button>
            ))}
          </div>

          {timer.mode === "pomodoro" && <div className="mt-4 space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {(["classic", "extended", "custom"] as const).map((preset) => (
                <button key={preset} type="button" aria-pressed={timer.pomodoroPreset === preset} onClick={() => setPomodoroPreset(preset)} className={`rounded-md border px-2 py-2 text-[10px] font-medium capitalize ${timer.pomodoroPreset === preset ? "border-amber-500/70 bg-amber-500/10 text-amber-300" : "border-[#394252] text-stone-400 hover:text-stone-200"}`}>
                  {preset}{preset === "classic" ? " · 25/5" : preset === "extended" ? " · 50/10" : ""}
                </button>
              ))}
            </div>
            {timer.pomodoroPreset === "custom" && <div className="grid grid-cols-2 gap-3">
              <label className="text-[10px] text-stone-400">Focus minutes<input type="number" min={1} max={240} value={timer.focusMinutes} onChange={(event) => {
                const focusMinutes = Math.min(240, Math.max(1, Number(event.target.value) || 1));
                setTimer((current) => ({ ...current, focusMinutes, remainingSeconds: current.phase === "focus" && !current.running ? focusMinutes * 60 : current.remainingSeconds }));
              }} className="mt-1 w-full rounded border border-[#394252] bg-[#0c1017] px-2 py-1.5 text-xs text-stone-200" /></label>
              <label className="text-[10px] text-stone-400">Break minutes<input type="number" min={1} max={120} value={timer.breakMinutes} onChange={(event) => setTimer((current) => ({ ...current, breakMinutes: Math.min(120, Math.max(1, Number(event.target.value) || 1)) }))} className="mt-1 w-full rounded border border-[#394252] bg-[#0c1017] px-2 py-1.5 text-xs text-stone-200" /></label>
            </div>}
          </div>}

          {timer.mode === "countdown" && <div className="mt-4 space-y-3">
            <div className="grid grid-cols-4 gap-2">
              {[15, 30, 45, 60].map((minutes) => <button key={minutes} type="button" aria-pressed={timer.countdownMinutes === minutes && timer.countdownSeconds === 0} onClick={() => setCountdownPreset(minutes)} className={`rounded-md border px-2 py-2 text-[10px] font-medium ${timer.countdownMinutes === minutes && timer.countdownSeconds === 0 ? "border-amber-500/70 bg-amber-500/10 text-amber-300" : "border-[#394252] text-stone-400 hover:text-stone-200"}`}>{minutes}m</button>)}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-[10px] text-stone-400">Minutes<input type="number" min={0} max={999} value={timer.countdownMinutes} onChange={(event) => {
                const countdownMinutes = Math.min(999, Math.max(0, Number(event.target.value) || 0));
                setTimer((current) => ({ ...current, countdownMinutes, running: false, endsAt: null, remainingSeconds: countdownMinutes * 60 + current.countdownSeconds }));
              }} className="mt-1 w-full rounded border border-[#394252] bg-[#0c1017] px-2 py-1.5 text-xs text-stone-200" /></label>
              <label className="text-[10px] text-stone-400">Seconds<input type="number" min={0} max={59} value={timer.countdownSeconds} onChange={(event) => {
                const countdownSeconds = Math.min(59, Math.max(0, Number(event.target.value) || 0));
                setTimer((current) => ({ ...current, countdownSeconds, running: false, endsAt: null, remainingSeconds: current.countdownMinutes * 60 + countdownSeconds }));
              }} className="mt-1 w-full rounded border border-[#394252] bg-[#0c1017] px-2 py-1.5 text-xs text-stone-200" /></label>
            </div>
          </div>}

          {notice && <p role="status" className="mt-3 rounded border border-amber-500/20 bg-amber-500/5 px-2.5 py-2 text-[10px] text-amber-200">{notice}</p>}
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={startPauseTimer} className="flex flex-1 items-center justify-center gap-2 rounded-md bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400">{timer.running ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}{timer.running ? "Pause" : "Start"}</button>
            <button type="button" onClick={resetTimer} aria-label="Reset timer" className="flex h-9 w-10 items-center justify-center rounded-md border border-[#394252] text-stone-300 hover:border-amber-500/50 hover:text-amber-300"><RotateCcw className="h-4 w-4" /></button>
          </div>
        </section>
      )}
    </div>
  );
}