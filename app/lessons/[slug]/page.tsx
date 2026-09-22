"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ChatMessage, ContentBlock, SavedVocabularyWord, StudentNote, StudyStepId, STUDY_STEPS, LessonContent, StudentSubmission } from "@/types/lesson";
import { getLessonById, type LessonWithVersion } from "@/lib/lessons";
import { getLessonStateKey, PublishedLessonState, writeLastAccessedLesson } from "@/lib/lesson-store";
import { fetchLesson, fetchLessonState, fetchSavedVocabulary, fetchStudentNotes, fetchStudentProgress, saveChatMessage, saveStudentNote, submitStudentLesson, removeVocabularyWord, saveVocabularyWord } from "@/services/storage-service";
import { FLUENTIA_USERS, INSTRUCTOR_USER, type StudentUser } from "@/lib/users";
import { supabase } from "@/lib/supabase";
import { Stepper } from "@/components/study-room/stepper";
import { CelebrationModal, StepResult } from "@/components/study-room/celebration-modal";
import { DictionaryModal } from "@/components/study-room/dictionary-modal";
import { LearningSidebar } from "@/components/study-room/learning-sidebar";
import { ChatWidget } from "@/components/study-room/chat-widget";
import { AccessCard } from "@/components/access/access-card";
import { AmbientMusicPlayer } from "@/components/study-room/ambient-music-player";
import { MarkdownContent } from "@/components/study-room/markdown-content";
import { CustomAudioPlayer } from "@/components/study-room/custom-audio-player";
import { InteractiveVideoBlock } from "@/components/shared/interactive-video-block";
import { FillInBlanksMarkdown } from "@/components/study-room/fill-in-blanks-markdown";
import { parseFillInBlanks } from "@/lib/fill-in-blanks";
import { uploadStudentAudio } from "@/services/storage-service";
import type { OptionIndexingStyle } from "@/types/lesson";
import {
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Sparkles,
  BookOpen,
  Headphones,
  FileText,
  Lock,
  Unlock,
  PenTool,
  Mic,
  Square,
  Award,
  PanelRight,
  Trash2,
  Lightbulb,
  X,
} from "lucide-react";

function getLockedSteps(completedSteps: StudyStepId[]): StudyStepId[] {
  const locked: StudyStepId[] = [];
  for (let i = 0; i < STUDY_STEPS.length; i++) {
    const step = STUDY_STEPS[i];
    if (i === 0) continue;
    const prev = STUDY_STEPS[i - 1];
    if (!completedSteps.includes(prev.id)) {
      locked.push(step.id);
    }
  }
  return locked;
}

function getRequestedStep(value: string | null): StudyStepId | null {
  if (!value) return null;
  const byId = STUDY_STEPS.find((step) => step.id === value);
  if (byId) return byId.id;
  const stepNumber = Number(value);
  return Number.isInteger(stepNumber) && stepNumber >= 1 && stepNumber <= STUDY_STEPS.length
    ? STUDY_STEPS[stepNumber - 1].id
    : null;
}

function formatQuestionOption(option: string, index: number, style?: OptionIndexingStyle) {
  if (style === "alphabetical") return `${String.fromCharCode(65 + index)}. ${option}`;
  if (style === "numeric") return `${index + 1}. ${option}`;
  return option;
}

function getStudentResponseType(block: ContentBlock): "text" | "voice" | "audio" | "file" {
  return block.studentResponseType || (block.studentResponseConfig?.allowedTypes.includes("audio") ? "audio" : "text");
}

function hasStudentResponse(block: ContentBlock) {
  return block.hasStudentResponseInput === true || block.studentResponseConfig?.enabled === true;
}

function FileResponseBlock({ value, onChange, studentId }: { value?: string; onChange: (value: string) => void; studentId?: string }) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const upload = async (file?: File) => {
    if (!file) return;
    setIsUploading(true);
    setError(null);
    try {
      const asset = await uploadStudentAudio(file, studentId?.trim() || "anonymous", file.name);
      onChange(asset.url);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };
  return <div className="mt-4 rounded-lg border border-[#202631] bg-[#0c1017] p-3"><label className="inline-flex cursor-pointer items-center rounded-md border border-[#394252] px-3 py-2 text-xs text-stone-300 hover:border-amber-500 hover:text-amber-300">{isUploading ? "Uploading..." : "Upload File"}<input type="file" onChange={(event) => void upload(event.target.files?.[0])} disabled={isUploading} className="sr-only" /></label>{value && <p className="mt-2 truncate text-xs text-emerald-300">File uploaded</p>}{error && <p className="mt-2 text-xs text-red-300">{error}</p>}</div>;
}

function AudioResponseBlock({ value, onChange, studentId }: { value?: string; onChange: (value: string) => void; studentId?: string }) {
  const [isUploading, setIsUploading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState<number[]>(Array(48).fill(3));
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const animRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startAt = useRef(0);

  const fmt = (s: number) => {
    const m = String(Math.floor(s / 60)).padStart(2, "0");
    const sec = String(Math.floor(s % 60)).padStart(2, "0");
    const cs = String(Math.floor((s % 1) * 100)).padStart(2, "0");
    return `${m}:${sec}.${cs}`;
  };
  const fmtInt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}.00`;

  const stopTracks = () => { streamRef.current?.getTracks().forEach(t=>t.stop()); streamRef.current=null; };
  const cleanup = () => {
    cancelAnimationFrame(animRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current=null;
    try{ ctxRef.current?.close(); }catch{}
    ctxRef.current=null;
  };
  useEffect(()=>()=>{ try{recorderRef.current?.state==="recording"&&recorderRef.current.stop();}catch{} cleanup(); stopTracks(); },[]);

  const uploadFile = async (file: File|Blob, name?: string) => {
    setIsUploading(true); setError(null);
    try {
      const asset = await uploadStudentAudio(file, studentId?.trim()||"anonymous", name||`response-${Date.now()}.webm`);
      onChange(asset.url);
    } catch (err) { setError(err instanceof Error?err.message:"Upload failed"); }
    finally { setIsUploading(false); }
  };

  const pickMime = () => {
    for (const t of ["audio/webm;codecs=opus","audio/webm","audio/mp4","audio/ogg;codecs=opus"]) {
      try{ if((MediaRecorder as unknown as {isTypeSupported?:(t:string)=>boolean}).isTypeSupported?.(t)) return t; }catch{}
    }
    return "";
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia) { setError("Recording not supported"); return; }
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current=stream;
      const mime = pickMime();
      const rec = new MediaRecorder(stream, mime?{mimeType:mime} as MediaRecorderOptions:undefined);
      chunksRef.current=[];
      rec.ondataavailable=e=>{ if(e.data.size>0) chunksRef.current.push(e.data); };
      rec.onstop=()=>{ const blob=new Blob(chunksRef.current,{type:rec.mimeType||mime||"audio/webm"}); const ext=(rec.mimeType||mime||"").includes("mp4")?"mp4":"webm"; cleanup(); stopTracks(); setIsRecording(false); setElapsed(0); void uploadFile(blob,`voice-${Date.now()}.${ext}`); };
      rec.onerror=()=>{ cleanup(); stopTracks(); setIsRecording(false); setError("Recording failed"); };
      recorderRef.current=rec; rec.start(100); setIsRecording(true); startAt.current=Date.now();
      timerRef.current=setInterval(()=> setElapsed((Date.now()-startAt.current)/1000),80);
      try{
        const Ctx=(window.AudioContext||(window as unknown as {webkitAudioContext:typeof AudioContext}).webkitAudioContext);
        const ctx=new Ctx(); ctxRef.current=ctx;
        const src=ctx.createMediaStreamSource(stream); const an=ctx.createAnalyser(); an.fftSize=128; src.connect(an);
        const arr=new Uint8Array(an.frequencyBinCount);
        const tick=()=>{ an.getByteFrequencyData(arr); setLevels(Array.from({length:48},(_,i)=>Math.max(2,Math.min(24,2+(arr[Math.floor(i/48*arr.length)]||0)*0.09)))); animRef.current=requestAnimationFrame(tick); };
        tick();
      }catch{}
    } catch(err){
      const m=err instanceof Error?err.message:String(err);
      setError(/permission|not allowed|denied/i.test(m)?"Microphone permission denied":"Could not start recording");
    }
  };
  const stopRecording=()=>{ if(recorderRef.current?.state==="recording") recorderRef.current.stop(); else { cleanup(); stopTracks(); setIsRecording(false); } };

  return (
    <div className="mt-4 w-full min-w-0 space-y-3 rounded-lg border border-[#202631] bg-[#0c1017] p-3">
      <div className="flex w-full min-w-0 items-center gap-3 rounded-lg border border-[#202631] bg-[#111620] px-3 py-2.5">
        <div className="relative shrink-0">
          {isRecording && <span className="absolute inset-0 animate-ping rounded-full bg-red-500/40" aria-hidden="true" />}
          <button
            type="button"
            onClick={() => (isRecording ? stopRecording() : void startRecording())}
            disabled={isUploading}
            aria-label={isRecording ? "Stop recording" : "Start recording"}
            className={`relative flex h-11 w-11 items-center justify-center rounded-full shadow-sm transition active:scale-95 disabled:opacity-40 ${isRecording ? "bg-red-500 text-white hover:bg-red-400" : "bg-amber-500 text-[#0c1017] hover:bg-amber-400"}`}
          >
            {isRecording ? <Square className="h-3.5 w-3.5 fill-current" /> : <Mic className="h-4 w-4" />}
          </button>
        </div>
        <div className="mx-4 flex h-8 min-w-0 flex-1 items-center gap-px overflow-hidden rounded-full bg-slate-700/50 px-2" aria-hidden>
          {isRecording ? (
            levels.map((h, i) => <span key={i} className="min-w-0 flex-1 rounded-full bg-amber-400/85 shadow-[0_0_8px_rgba(251,191,36,0.22)] transition-[height] duration-100 ease-linear" style={{ height: Math.max(4, h) }} />)
          ) : (
            <span className="h-1.5 w-full rounded-full bg-slate-800/80" />
          )}
        </div>
        <span className={`shrink-0 font-mono text-xs tabular-nums ${isRecording ? "text-stone-300" : "text-stone-500"}`}>{isRecording ? fmt(elapsed) : fmtInt(0)}</span>
      </div>
      <div className="flex items-center gap-2">
        <label className={`inline-flex cursor-pointer items-center rounded-md border px-3 py-1.5 text-xs font-medium transition ${isUploading||isRecording?"pointer-events-none border-[#202631] text-stone-500 opacity-50":"border-[#394252] text-stone-300 hover:border-amber-500 hover:text-amber-300"}`}>
          Upload Audio File
          <input type="file" accept="audio/*,audio/mpeg,audio/wav,audio/webm,audio/mp4,audio/ogg" onChange={e=>void uploadFile(e.target.files?.[0] as File, (e.target.files?.[0] as File)?.name)} disabled={isUploading||isRecording} className="sr-only" />
        </label>
        {isUploading && <span className="text-[11px] text-stone-500">Uploading…</span>}
      </div>
      {error && <p className="text-[11px] text-red-300">{error}</p>}
      {value && (
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <CustomAudioPlayer src={value} label="Your recording" />
          </div>
          <button
            type="button"
            onClick={() => { setError(null); onChange(""); }}
            disabled={isUploading || isRecording}
            aria-label="Clear recording"
            title="Clear recording"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[#394252] bg-[#171d28] px-2.5 py-2 text-xs text-stone-400 transition hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear
          </button>
        </div>
      )}
    </div>
  );
}

function MediaTranscriptAccordion({ transcript, isUnlocked }: { transcript?: string; isUnlocked: boolean }) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isUnlocked) setIsOpen(false);
  }, [isUnlocked]);

  if (!isUnlocked) {
    return (
      <div className="group relative mt-4">
        <button
          type="button"
          disabled
          aria-disabled="true"
          className="flex w-full cursor-not-allowed items-center gap-2 rounded-md border border-[#293343] bg-[#0c1017] px-3 py-2 text-left text-xs text-stone-500 opacity-80"
        >
          <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Transcript
        </button>
        <span role="tooltip" className="pointer-events-none absolute bottom-full left-0 z-10 mb-2 hidden max-w-sm rounded-md border border-[#394252] bg-[#171d28] px-3 py-2 text-xs leading-relaxed text-stone-300 shadow-xl group-hover:block">
          Transcript locks until lesson submission. Complete all steps to unlock for review.
        </span>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-md border border-amber-500/20 bg-[#0c1017]">
      <button type="button" onClick={() => setIsOpen((open) => !open)} aria-expanded={isOpen} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-amber-300">
        <Unlock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Transcript
        <ChevronDown className={`ml-auto h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {isOpen && <div className="border-t border-[#293343] px-3 py-3">
        {transcript?.trim() ? <MarkdownContent value={transcript} className="text-sm leading-relaxed text-stone-300" /> : <p className="text-xs text-stone-500">No transcript was provided for this media.</p>}
      </div>}
    </div>
  );
}

export default function LessonPage() {
  const rawSlug = useParams()?.slug;
  const searchParams = useSearchParams();
  const requestedSlug = typeof rawSlug === "string" ? rawSlug : searchParams.get("slug") || searchParams.get("id") || "";
  const [lesson, setLesson] = useState<LessonWithVersion | null>(null);
  const [loading, setLoading] = useState(true);
  const [isMounted, setIsMounted] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [lessonReady, setLessonReady] = useState(false);
  const [lessonNotFound, setLessonNotFound] = useState(false);
  const [activeStudent, setActiveStudent] = useState<StudentUser | null>(null);
  const [studentReady, setStudentReady] = useState(false);
  const [currentStep, setCurrentStep] = useState<StudyStepId>("warm_up");
  const [lessonStateHydrated, setLessonStateHydrated] = useState(false);
  const [submissionHydrated, setSubmissionHydrated] = useState(false);
  const [completedSteps, setCompletedSteps] = useState<StudyStepId[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [publishedLesson, setPublishedLesson] = useState<PublishedLessonState | null>(null);
  const [submission, setSubmission] = useState<StudentSubmission>({
    status: "in_progress",
    listeningAnswers: {},
    readingAnswers: {},
    writingText: "",
    blockResponses: {},
    quizSelections: {},
    audioUploads: {},
  });
  const [visibleSampleAnswers, setVisibleSampleAnswers] = useState<Record<string, boolean>>({});
  const [savedWords, setSavedWords] = useState<SavedVocabularyWord[]>([]);
  const [notes, setNotes] = useState<StudentNote[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [dictionaryWord, setDictionaryWord] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [guidanceOpen, setGuidanceOpen] = useState(false);
  const [submissionSaveError, setSubmissionSaveError] = useState<string | null>(null);
  const [studentBannerUrl, setStudentBannerUrl] = useState<string | null>(null);
  const [bannerLoadFailed, setBannerLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadAuthenticatedStudent = async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (cancelled) return;

        const isSessionMissing = Boolean(error && (error.name === "AuthSessionMissingError" || /Auth session missing/i.test(error.message || "")));
        if (error && !isSessionMissing) {
          console.error("Unable to resolve authenticated student:", error);
          setAccessDenied(true);
          setStudentReady(true);
          setIsMounted(true);
          return;
        }

        if (!data.user) {
          setStudentReady(true);
          setIsMounted(true);
          return;
        }

        const user = data.user;
        const [studentResult, profileResult] = await Promise.all([
          supabase.from("students").select("name, email, token").eq("id", user.id).maybeSingle(),
          supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
        ]);
        if (cancelled) return;

        const { data: studentRecord, error: studentError } = studentResult;
        const { data: profile, error: profileError } = profileResult;
        if (studentError) console.warn("Unable to load canonical student profile:", studentError);
        if (profileError) console.warn("Unable to load user profile:", profileError);
        if (studentError?.code === "42501" || /permission|row-level security|rls/i.test(studentError?.message || "")) {
          console.error("RLS or permission error reading students for authenticated user:", studentError);
        }
        if (profileError?.code === "42501" || /permission|row-level security|rls/i.test(profileError?.message || "")) {
          console.error("RLS or permission error reading profiles for authenticated user:", profileError);
        }

        const firstNonEmpty = (...values: unknown[]) => values.find(
          (value): value is string => typeof value === "string" && value.trim().length > 0,
        )?.trim() || "Student";
        const email = firstNonEmpty(studentRecord?.email, user.email, "");
        const emailName = email.includes("@")
          ? email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
          : "";
        const localUser = email
          ? FLUENTIA_USERS.find((candidate) => candidate.email?.toLowerCase() === email.toLowerCase())
          : undefined;
        const name = firstNonEmpty(
          studentRecord?.name,
          profile?.full_name,
          user.user_metadata?.full_name,
          localUser?.name,
          emailName,
          email,
        );
        const student: StudentUser = {
          id: user.id,
          token: studentRecord?.token || user.id,
          name,
          email,
          role: "student",
          profile: {
            id: data.user.id,
            fullName: name,
            level: "",
            targetGoal: "",
            weaknesses: [],
            teacherNotes: "",
            attendanceRate: 0,
            completedModulesCount: 0,
          },
        };
        setActiveStudent(student);
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        if (/Auth session missing/i.test(message)) {
          setStudentReady(true);
          setIsMounted(true);
          return;
        }
        console.error("Unable to resolve authenticated student:", error);
        setAccessDenied(true);
      } finally {
        if (!cancelled) {
          setStudentReady(true);
          setIsMounted(true);
        }
      }
    };

    void loadAuthenticatedStudent();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch lesson data asynchronously
  useEffect(() => {
    if (!requestedSlug) return;
    let mounted = true;
    setLessonReady(false);
    setLessonNotFound(false);
    setLessonStateHydrated(false);
    setSubmissionHydrated(false);
    setSubmission({
      status: "in_progress",
      listeningAnswers: {},
      readingAnswers: {},
      writingText: "",
      blockResponses: {},
      quizSelections: {},
      audioUploads: {},
    });
    setLoading(true);

    const loadLesson = async () => {
      try {
        const lesson = await getLessonById(requestedSlug);
        if (!mounted) return;
        
        if (lesson) {
          setLesson(lesson);
          if (activeStudent?.token) {
            writeLastAccessedLesson(lesson.id, activeStudent.token);
          }
        } else {
          setLessonNotFound(true);
        }
      } catch (error) {
        if (!mounted) return;
        console.error("Failed to load lesson:", error);
        setLessonNotFound(true);
      } finally {
        setLoading(false);
        if (mounted) {
          setLessonReady(true);
        }
      }
    };

    loadLesson();
    return () => {
      mounted = false;
    };
  }, [requestedSlug]);

  useEffect(() => {
    const token = activeStudent?.token;
    if (!token) return;
    const readBannerPreference = () => {
      try {
        const stored = window.localStorage.getItem(`fluentia:profile:${token}`);
        if (!stored) {
          setStudentBannerUrl(null);
          return;
        }
        const preferences = JSON.parse(stored) as { customBannerUrl?: string; bannerPreset?: string };
        const presetImages: Record<string, string> = {
          "default-dark": "https://images.unsplash.com/photo-1519608487953-e999c86e7455?w=1600&q=85",
          mountains: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1600&q=85",
          architecture: "https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=1600&q=85",
        };
        const candidate = typeof preferences.customBannerUrl === "string" && preferences.customBannerUrl.trim()
          ? preferences.customBannerUrl.trim()
          : presetImages[preferences.bannerPreset || "default-dark"];
        setStudentBannerUrl(candidate || null);
        setBannerLoadFailed(false);
      } catch {
        setStudentBannerUrl(null);
      }
    };
    readBannerPreference();
    window.addEventListener("storage", readBannerPreference);
    window.addEventListener("fluentia:student-profile-updated", readBannerPreference);
    return () => {
      window.removeEventListener("storage", readBannerPreference);
      window.removeEventListener("fluentia:student-profile-updated", readBannerPreference);
    };
  }, [activeStudent?.token]);

  useEffect(() => {
    if (!lessonReady || !studentReady || lessonNotFound || !lesson) return;
    const activeToken = activeStudent?.token || lesson.student_token || lesson.student_id || "student";
    if (typeof window !== "undefined" && lesson.updated_at) {
      const cacheVersionKey = `fluentia:lesson-cache-version:${lesson.id}:${activeToken}`;
      const cachedVersion = window.localStorage.getItem(cacheVersionKey);
      if (cachedVersion !== lesson.updated_at) {
        window.localStorage.removeItem(getLessonStateKey(lesson.id, activeToken));
        window.localStorage.setItem(cacheVersionKey, lesson.updated_at);
      }
    }
    setCurrentStep("warm_up");
    const params = new URLSearchParams(window.location.search);
    const requestedStep = getRequestedStep(params.get("step"));
    const startStep = params.get("start");
    void Promise.all([
      fetchLessonState(lesson.id, activeToken),
      fetchStudentProgress(lesson.id, activeToken),
    ]).then(([state, progress]) => {
      const hydratedSubmission = state?.submission;
      const canShowResults = hydratedSubmission?.status === "submitted" || hydratedSubmission?.status === "reviewed";
      const requestedNonResultsStep = requestedStep && requestedStep !== "results" ? requestedStep : null;
      const persistedStep = progress.currentStep !== "results" || canShowResults ? progress.currentStep : "warm_up";
      setPublishedLesson(state?.status !== "draft" ? state : null);
      setSubmission(hydratedSubmission || {
        status: "in_progress",
        listeningAnswers: {},
        readingAnswers: {},
        writingText: "",
        blockResponses: {},
        quizSelections: {},
        audioUploads: {},
      });
      setCurrentStep(canShowResults && requestedStep === "results"
        ? "results"
        : requestedNonResultsStep || (startStep === "warm_up" ? "warm_up" : persistedStep));
      setCompletedSteps(progress.completedSteps);
      setSubmissionHydrated(true);
      setLessonStateHydrated(true);
    }).catch((error) => {
      console.error("Failed to hydrate lesson state:", error);
      setCurrentStep("warm_up");
      setCompletedSteps([]);
      setSubmissionHydrated(true);
      setLessonStateHydrated(true);
    });
  }, [activeStudent?.token, lessonReady, lessonNotFound, lesson, studentReady]);

  useEffect(() => {
    if (!studentReady || accessDenied) return;
    const activeToken = activeStudent?.token || lesson?.student_token || lesson?.student_id || "student";
    void Promise.all([
      fetchSavedVocabulary(activeToken),
      fetchStudentNotes(activeToken),
    ]).then(([words, savedNotes]) => {
      setSavedWords(words);
      setNotes(savedNotes);
    }).catch((error) => {
      console.error("Failed to load student resources:", error);
    });
  }, [accessDenied, activeStudent?.token, lesson?.student_id, lesson?.student_token, studentReady]);

  useEffect(() => {
    function handleDoubleClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, button, a, [role=dialog]")) return;

      const selectedText = window.getSelection()?.toString().trim() || "";
      const selectedWord = selectedText.match(/^[a-zA-Z]+(?:[-'][a-zA-Z]+)*$/)?.[0];
      if (selectedWord && selectedWord.length > 1) setDictionaryWord(selectedWord);
    }

    document.addEventListener("dblclick", handleDoubleClick);
    return () => document.removeEventListener("dblclick", handleDoubleClick);
  }, []);

  async function persistSubmission(nextSubmission: StudentSubmission, nextProgress?: { currentStep?: StudyStepId; completedSteps?: StudyStepId[]; status?: "not_started" | "in_progress" | "submitted" | "reviewed" }) {
    if (!lesson) return;
    setSubmission(nextSubmission);
    setSubmissionSaveError(null);
    try {
      const tok = activeStudent?.token ?? lesson.student_token ?? undefined;
      await submitStudentLesson(lesson.id, tok, nextSubmission, {
        currentStep: nextProgress?.currentStep || currentStep,
        completedSteps: nextProgress?.completedSteps || completedSteps,
        status: nextProgress?.status || (nextSubmission.status === "submitted" ? "submitted" : "in_progress"),
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      try {
        const sid = activeStudent?.id || lesson.student_id || "local";
        const { saveLessonState: _sls } = await import("@/services/storage-service");
        (_sls as unknown as (a:string,b:string,c:unknown)=>void)(lesson.id, sid, { submission: nextSubmission, progress: { currentStep: nextProgress?.currentStep || currentStep, completedSteps: nextProgress?.completedSteps || completedSteps, startedAt: new Date().toISOString(), updatedAt: new Date().toISOString() } });
      } catch {}
      console.warn("Persist fallback to local", error);
    }
  }

  const lessonContent = (lesson?.content || {}) as any;
  const rawLessonContent = lessonContent as Record<string, unknown>;
  const lessonPageResources = (rawLessonContent.lessonResources as { id: string; title: string; url: string; type: string }[] | undefined) || [];
  const lessonMetadata = lessonContent as LessonContent;
  const displayLessonTitle = lesson?.title.replace(/\s+\((?:A1|A2|B1|B2|C1|C2)\b[^)]*\)$/i, "");
  const lessonSubtitle = typeof lesson?.subtitle === "string"
    ? lesson.subtitle.trim()
    : typeof lessonContent.subtitle === "string"
      ? lessonContent.subtitle.trim()
      : "";
  const lessonModuleNumber = typeof lessonContent.moduleNumber === "number"
    ? lessonContent.moduleNumber
    : typeof lesson?.module_number === "number"
      ? lesson.module_number
      : null;
  const lessonLevel = (lesson?.grade || "English B1").replace(/\s+Intermediate$/i, "").toUpperCase();
  const instructor = { fullName: INSTRUCTOR_USER.name, initials: "AV" };
  const lessonBanner = typeof lessonContent.coverImage === "string"
    ? lessonContent.coverImage
    : typeof lesson?.banner_url === "string"
      ? lesson.banner_url
      : undefined;
  const heroBanner = bannerLoadFailed ? "https://images.unsplash.com/photo-1519608487953-e999c86e7455?w=1600&q=85" : studentBannerUrl || lessonBanner;
  const evaluation = publishedLesson?.evaluation;
  const isEvaluationPublished = evaluation?.published === true;
  const totalScore = evaluation
    ? Object.values(evaluation.scores).reduce<number>((total, score) => total + Number(score), 0)
    : 0;
  const getStepResponse = (step: "warm_up" | "lesson") => {
    const stepContent = lessonContent[step] as { blocks?: ContentBlock[] } | undefined;
    const responses = stepContent?.blocks?.map((block) => {
      if (block.type === "text") return submission.blockResponses?.[block.id];
      if (block.type === "question") return submission.quizSelections?.[block.id];
      if (block.type === "quiz") return block.questions.map((question) => `${question.prompt}: ${submission.quizSelections?.[question.id] || ""}`).filter(Boolean).join("\n");
      if (block.type === "fill-in-the-blanks") return parseFillInBlanks(block.textWithBlanks).map((blank, blankIndex) => `${blank.answer}: ${submission.blockResponses?.[`${block.id}-blank-${blankIndex}`] || ""}`).join("\n");
      return "";
    }).filter(Boolean) || [];
    return submission.blockResponses?.[step] || responses.join("\n") || "";
  };

  const getBlockAnswerKeys = (step: "warm_up" | "lesson" | "listening" | "reading") => {
    const blocks = ((lessonContent[step] as { blocks?: ContentBlock[] } | undefined)?.blocks || []);
    return blocks.flatMap((block) => {
      if (block.type === "question") return block.correct_answer.trim();
      if (block.type === "quiz") return block.questions.map((question) => (question.correct_answer || question.correctAnswer || "").trim());
      if (block.type === "fill-in-the-blanks") return block.acceptableAnswers.flatMap((answers) => answers).map((answer) => answer.trim());
      return [];
    }).filter(Boolean).join("\n");
  };

  const getAnswerKeys = (step: "listening" | "reading") => {
    const keys = step === "listening"
      ? (lessonContent.listening?.questions || []).map((question: { id: string; correct_answer?: string }) => question.correct_answer || lessonContent.results?.answer_keys?.listening?.[question.id] || "")
      : (lessonContent.reading?.analytical_questions || []).map((question: { id: string; correct_answer?: string }) => question.correct_answer || lessonContent.results?.answer_keys?.reading?.[question.id] || "");
    return [...keys, getBlockAnswerKeys(step)].filter(Boolean).join("\n");
  };

  const benchmarkResults = (lessonContent.results || {}) as {
    answer_keys?: Record<string, Record<string, string>>;
    quiz_breakdown?: Array<{ questionId: string; correctResponse: string; skill: string }>;
    feedback_notes?: Record<string, string>;
    instructor_feedback?: { status?: string; strengths?: string; areasToImprove?: string; nextStep?: string };
    stepLabel?: string;
  };
  const resultSummary = ((lessonContent.results?.blocks || []) as ContentBlock[]).find(
    (block) => block.type === "text" && block.title?.toLowerCase() === "summary"
  );

  const stepResults: StepResult[] = [
    { id: "warm-up", step: "Warm-up", prompt: lessonContent.warm_up?.quote?.text || lessonContent.warm_up?.intro_narrative?.text, answer: getStepResponse("warm_up"), referenceAnswer: getBlockAnswerKeys("warm_up") || undefined },
    { id: "lesson", step: "Lesson", prompt: lessonContent.lesson?.core_concept?.text, answer: getStepResponse("lesson"), referenceAnswer: getBlockAnswerKeys("lesson") || undefined },
    { id: "listening", step: "Listening", prompt: (lessonContent.listening?.questions || []).map((question: { question: string }) => question.question).join("\n"), answer: Object.values(submission.listeningAnswers).join("\n"), referenceAnswer: getAnswerKeys("listening") || undefined },
    { id: "reading", step: "Reading", prompt: (lessonContent.reading?.analytical_questions || []).map((question: { question: string }) => question.question).join("\n"), answer: Object.values(submission.readingAnswers).join("\n"), referenceAnswer: getAnswerKeys("reading") || undefined },
    { id: "writing", step: "Writing", prompt: lessonContent.writing?.prompt?.text, answer: submission.writingText },
    { id: "speaking", step: "Speaking", prompt: lessonContent.speaking?.scenario?.text, answer: submission.speakingAudioUrl || Object.values(submission.audioUploads || {})[0] || Object.values(submission.blockResponses || {}).find((v: string) => typeof v === "string" && (v.startsWith("http") || v.endsWith(".webm") || v.endsWith(".mp3") || v.includes("blob:"))) || "" },
  ];

  const currentIndex = STUDY_STEPS.findIndex((s) => s.id === currentStep);
  const lockedSteps = getLockedSteps(completedSteps);
  const stepperLockedSteps = completedSteps.includes("results")
    ? lockedSteps
    : [...new Set([...lockedSteps, "results" as StudyStepId])];

  function markStepComplete(stepId: StudyStepId) {
    setCompletedSteps((prev) =>
      prev.includes(stepId) ? prev : [...prev, stepId]
    );
  }

  async function handleNext() {
    markStepComplete(currentStep);
    const nextCompletedSteps = completedSteps.includes(currentStep) ? completedSteps : [...completedSteps, currentStep];
    if (currentIndex < STUDY_STEPS.length - 2) {
      setCurrentStep(STUDY_STEPS[currentIndex + 1].id);
    } else if (currentIndex === STUDY_STEPS.length - 2) {
      setIsModalOpen(true);
    }
    if (submission.status === "in_progress") {
      void persistSubmission({ ...submission, status: "in_progress" }, { completedSteps: nextCompletedSteps, currentStep });
    }
  }

  function handlePrev() {
    if (currentIndex > 0) {
      setCurrentStep(STUDY_STEPS[currentIndex - 1].id);
    }
  }

  function handleStepClick(stepId: StudyStepId) {
    if (stepperLockedSteps.includes(stepId)) return;
    setCurrentStep(stepId);
  }

  function handleReviewAnswers() {
    setIsModalOpen(false);
    setCurrentStep("warm_up");
  }

  async function handleSubmitFinal() {
    setIsModalOpen(false);
    markStepComplete("speaking");
    markStepComplete("results");
    setCurrentStep("results");
    void persistSubmission({ ...submission, status: "submitted", submittedAt: new Date().toISOString() }, { currentStep: "results", completedSteps: [...STUDY_STEPS.map((step) => step.id)], status: "submitted" });
  }

  const isResultsStep = currentStep === "results";
  const areTranscriptsUnlocked = submission.status === "submitted"
    || submission.status === "reviewed"
    || completedSteps.includes("results")
    || isResultsStep;
  const lessonStudentToken = activeStudent?.token ?? lesson?.student_token ?? lesson?.student_id ?? "student";
  const studentDisplayName = activeStudent?.name || "Student";
  const currentStepSidebarBlocks = ((rawLessonContent.sidebarBlocks as Record<string, { id: string; title: string; body: string; parentMainBlockId?: string }[]> | undefined)?.[currentStep] || []);

  if (!isMounted) {
    return <div className="fluentia-study-room min-h-screen bg-[#0c1017] text-[#e8e7e4]" />;
  }

  if (accessDenied) {
    return <AccessCard title="Student access required" message="Sign in with an authorized student account to open this lesson." />;
  }

  if (loading || !lessonReady || !studentReady) {
    return (
      <div className="fluentia-study-room flex min-h-screen items-center justify-center bg-[#0c1017] px-5 text-sm text-stone-400">
        Loading lesson...
      </div>
    );
  }

  if (lessonNotFound || !lesson) {
    return (
      <div className="fluentia-study-room flex min-h-screen flex-col items-center justify-center bg-[#0c1017] px-5 py-16 text-center text-[#e8e7e4]">
        <h1 className="font-sans text-2xl text-[#f1eee8]">Lesson not found or still in draft</h1>
        <p className="mt-3 max-w-md text-sm text-[#8f98a8]">This lesson does not have a published version yet. Please return to your dashboard and try again later.</p>
        <Link href="/dashboard" className="mt-6 inline-flex rounded-md bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950">Return to Dashboard</Link>
      </div>
    );
  }

  if (!lessonStateHydrated || !submissionHydrated) {
    return (
      <div className="fluentia-study-room flex min-h-screen items-center justify-center bg-[#0c1017] px-5 text-sm text-stone-400">
        Preparing study room...
      </div>
    );
  }

  const renderDynamicBlocks = (blocks: ContentBlock[]) => {
    const renderSidebarBlock = (sidebarBlock: { id: string; title: string; body: string }) => (
      <div className="rounded-xl border border-[#202631] bg-[#121721] p-4">
        {sidebarBlock.title.trim() && sidebarBlock.title.trim() !== "Sidebar note" && <MarkdownContent value={sidebarBlock.title} className="text-xs font-semibold text-amber-400 [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-xs [&_p]:m-0" />}
        <MarkdownContent value={sidebarBlock.body || "—"} className="mt-2 text-sm leading-relaxed text-slate-300 [&_strong]:font-semibold [&_strong]:text-amber-400" />
      </div>
    );
    const renderFillInTheBlanks = (block: Extract<ContentBlock, { type: "fill-in-the-blanks" }>) => {
      const values = submission.blockResponses || {};
      return <FillInBlanksMarkdown blockId={block.id} text={block.textWithBlanks} acceptableAnswers={block.acceptableAnswers} wordBank={block.wordBank} caseSensitive={block.caseSensitive} values={values} showFeedback showResults={submission.status === "submitted" || submission.status === "reviewed"} onChange={(blankIndex, value) => void persistSubmission({ ...submission, blockResponses: { ...values, [`${block.id}-blank-${blankIndex}`]: value } })} className="text-sm leading-relaxed text-stone-300" />;
    };
    const visibleBlocks = blocks.filter((block) => block.is_active !== false && block.enabled !== false);
    const questionBlocks = visibleBlocks.filter((block) => block.type === "question");
    const linkedSidebarIds = new Set([
      ...currentStepSidebarBlocks.filter((sidebarBlock) => sidebarBlock.parentMainBlockId).map((sidebarBlock) => sidebarBlock.id),
      ...visibleBlocks.filter((block) => block.layoutMode === "inline-row" && block.sidebarBlockId).map((block) => block.sidebarBlockId),
    ]);
    const topSidebarBlocks = currentStepSidebarBlocks.filter((sidebarBlock) => !linkedSidebarIds.has(sidebarBlock.id));
    const questionSidebarBlocks = questionBlocks
      .map((questionBlock) => currentStepSidebarBlocks.find((candidate) => candidate.parentMainBlockId === questionBlock.id))
      .filter((sidebarBlock): sidebarBlock is (typeof currentStepSidebarBlocks)[number] => Boolean(sidebarBlock))
      .filter((sidebarBlock, sidebarIndex, sidebarBlocks) => sidebarBlocks.findIndex((candidate) => candidate.id === sidebarBlock.id) === sidebarIndex);
    return (
    <div className="w-full space-y-6">
      {visibleBlocks.map((block, blockIndex) => {
        if (block.type === "question" && block !== questionBlocks[0]) return null;
        const sidebarBlock = currentStepSidebarBlocks.find((candidate) => candidate.parentMainBlockId === block.id)
          || (block.layoutMode === "inline-row" && block.sidebarBlockId
            ? currentStepSidebarBlocks.find((candidate) => candidate.id === block.sidebarBlockId)
            : undefined);
        const expandsInlineRow = block.layoutMode === "inline-row" && !sidebarBlock && block.rowEmptyMode === "full";
        const article = (
        <article key={block.id} className="rounded-xl border border-[#202631] bg-[#121721] p-5">
          {block.title && <h3 className="mb-3 font-sans text-xl font-semibold text-stone-100">{block.title}</h3>}
          {block.type === "text" && <><MarkdownContent value={block.body} className="text-sm leading-relaxed text-stone-300" />{hasStudentResponse(block) && (() => { const responseType = getStudentResponseType(block); if (responseType === "voice" || responseType === "audio") return <AudioResponseBlock studentId={activeStudent?.id} value={submission.audioUploads?.[block.id]} onChange={(value) => void persistSubmission({ ...submission, audioUploads: { ...(submission.audioUploads || {}), [block.id]: value }, speakingAudioUrl: value })} />; if (responseType === "file") return <FileResponseBlock studentId={activeStudent?.id} value={submission.audioUploads?.[block.id]} onChange={(value) => void persistSubmission({ ...submission, audioUploads: { ...(submission.audioUploads || {}), [block.id]: value } })} />; return <textarea value={submission.blockResponses?.[block.id] || ""} onChange={(event) => void persistSubmission({ ...submission, blockResponses: { ...(submission.blockResponses || {}), [block.id]: event.target.value } })} rows={8} placeholder="Write your response here..." className="mt-4 w-full min-h-[200px] resize-y rounded-lg border border-[#202631] bg-[#0c1017] p-3 text-sm text-stone-200 outline-none focus:border-amber-500" aria-label={`${block.title || "Text"} response`} />; })()}</>}
          {block.type === "audio" && <>{block.audioUrl ? <CustomAudioPlayer src={block.audioUrl} label={block.title || "Audio assignment"} /> : <div className="rounded border border-dashed border-[#394252] p-4 text-xs text-stone-500">Audio assignment</div>}{block.allowStudentVoiceResponse === true && <AudioResponseBlock studentId={activeStudent?.id} value={submission.audioUploads?.[block.id]} onChange={(value) => void persistSubmission({ ...submission, audioUploads: { ...(submission.audioUploads || {}), [block.id]: value }, speakingAudioUrl: value })} />}<MediaTranscriptAccordion transcript={block.transcript} isUnlocked={areTranscriptsUnlocked} /></>}
          {block.type === "video" && <><InteractiveVideoBlock videoUrl={block.videoUrl} title={block.title || "Lesson video"} transcript={block.transcript} transcriptLocked={!areTranscriptsUnlocked} />{!areTranscriptsUnlocked && <MediaTranscriptAccordion transcript={block.transcript} isUnlocked={false} />}{block.show_reflection_prompt !== false && <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-4"><p className="text-sm font-semibold text-amber-200">Reflection Question</p><p className="mt-2 text-sm leading-relaxed text-stone-300">{block.reflection_prompt_text?.trim() || "Think of an everyday product or app you use that frustrates you. Is it a problem of aesthetics or functionality? How would you redesign it?"}</p><textarea value={submission.blockResponses?.[`${block.id}-reflection`] || ""} onChange={(event) => void persistSubmission({ ...submission, blockResponses: { ...(submission.blockResponses || {}), [`${block.id}-reflection`]: event.target.value } })} rows={5} placeholder="Write your reflection here..." className="mt-3 w-full resize-y rounded-lg border border-[#202631] bg-[#0c1017] p-3 text-sm text-stone-200 outline-none focus:border-amber-500" aria-label="Reflection question response" /></div>}</>}
          {block.type === "fill-in-the-blanks" && renderFillInTheBlanks(block)}
          {block.type === "image" && (block.imageUrl ? <figure><img src={block.imageUrl} alt={block.caption || block.title || "Lesson image"} className="max-h-[420px] w-full rounded-lg object-cover" onError={(e)=>{ (e.target as HTMLImageElement).style.display="none"; (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden"); }} /><div className="hidden rounded border border-dashed border-[#394252] p-4 text-xs text-stone-500">Image unavailable — {block.caption || block.title || "Lesson image"}</div>{block.caption && <figcaption className="mt-2 text-xs text-stone-500">{block.caption}</figcaption>}</figure> : <div className="rounded border border-dashed border-[#394252] p-4 text-xs text-stone-500">Image placeholder</div>)}
          {block.type === "resource" && <a href={block.resourceUrl} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-200 hover:border-amber-400">{block.description || "Open document"}<span aria-hidden="true">PDF</span></a>}
          {block.type === "question" && <div className="space-y-5">{questionBlocks.map((questionBlock) => <div key={questionBlock.id} className="space-y-2">{questionBlock.title && <h4 className="text-sm font-semibold text-stone-100">{questionBlock.title}</h4>}<MarkdownContent value={questionBlock.prompt} className="text-sm text-stone-300" />{(questionBlock.question_type || "multiple_choice") === "open_ended" ? <><textarea value={submission.blockResponses?.[questionBlock.id] || ""} onChange={(event) => void persistSubmission({ ...submission, blockResponses: { ...(submission.blockResponses || {}), [questionBlock.id]: event.target.value } })} rows={7} placeholder="Write your response here..." className="min-h-[160px] w-full resize-y rounded-lg border border-[#202631] bg-[#0c1017] p-3 text-sm text-stone-200 outline-none focus:border-amber-500" aria-label={`${questionBlock.title || "Question"} response`} />{questionBlock.sample_answer?.trim() && <><button type="button" onClick={() => setVisibleSampleAnswers((current) => ({ ...current, [questionBlock.id]: !current[questionBlock.id] }))} className="text-xs text-amber-300 hover:text-amber-200">{visibleSampleAnswers[questionBlock.id] ? "Hide sample answer" : "Show sample answer"}</button>{visibleSampleAnswers[questionBlock.id] && <MarkdownContent value={questionBlock.sample_answer} className="rounded border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-stone-300" />}</>}</> : <div className="grid gap-2 sm:grid-cols-2">{questionBlock.options.filter(Boolean).map((option, optionIndex) => <button key={option} type="button" onClick={() => void persistSubmission({ ...submission, quizSelections: { ...(submission.quizSelections || {}), [questionBlock.id]: option } })} className={`rounded-md border px-3 py-2 text-left text-xs transition ${submission.quizSelections?.[questionBlock.id] === option ? "border-amber-500 bg-amber-500/10 text-amber-300" : "border-[#202631] bg-[#0c1017] text-stone-400 hover:border-amber-500/50 hover:text-amber-300"}`}>{formatQuestionOption(option, optionIndex, questionBlock.optionIndexingStyle)}</button>)}</div>}</div>)}</div>}
          {block.type === "quiz" && <div className="space-y-4">{block.questions.map((question, questionIndex) => <div key={`${question.id || "question"}-${questionIndex}`}><MarkdownContent value={question.prompt} className="text-sm text-stone-300" /><div className="mt-2 grid gap-2 sm:grid-cols-2">{question.options.map((option, optionIndex) => <button key={`${question.id || "question"}-${questionIndex}-${optionIndex}`} type="button" onClick={() => void persistSubmission({ ...submission, quizSelections: { ...(submission.quizSelections || {}), [question.id]: option } })} className={`rounded-md border px-3 py-2 text-left text-xs transition ${submission.quizSelections?.[question.id] === option ? "border-amber-500 bg-amber-500/10 text-amber-300" : "border-[#202631] bg-[#0c1017] text-stone-400 hover:border-amber-500/50 hover:text-amber-300"}`}>{option}</button>)}</div></div>)}</div>}
        </article>
        );
        const sidebarContent = (
          <div className="lg:col-span-1 h-full w-full space-y-4">
            {blockIndex === 0 && topSidebarBlocks.map((topSidebarBlock) => <div key={topSidebarBlock.id}>{renderSidebarBlock(topSidebarBlock)}</div>)}
            {(block.type === "question" ? questionSidebarBlocks : sidebarBlock ? [sidebarBlock] : []).map((sidebarItem) => <div key={sidebarItem.id}>{renderSidebarBlock(sidebarItem)}</div>)}
          </div>
        );
        return (
          <div key={block.id} className={`grid grid-cols-1 gap-6 items-stretch my-6 w-full ${expandsInlineRow ? "lg:grid-cols-12" : "lg:grid-cols-3"}`}>
            <div className={`${expandsInlineRow ? "lg:col-span-12" : "lg:col-span-2"} h-full w-full`}>{article}</div>
            {!expandsInlineRow && sidebarContent}
          </div>
        );
      })}
      {visibleBlocks.length === 0 && <p className="rounded-xl border border-dashed border-[#394252] p-6 text-sm text-stone-500">This step has no content blocks yet.</p>}
    </div>
    );
  };

  return (
    <div className="fluentia-study-room min-h-screen bg-[#0c1017] text-[#e8e7e4]">
      <div className="mx-auto max-w-7xl px-4 pt-6 md:px-6">
      {!isResultsStep && (
        <section className="relative flex min-h-[320px] w-full items-start overflow-hidden rounded-xl bg-slate-950 bg-cover bg-center md:min-h-[320px]">
          {heroBanner ? (
            <img src={heroBanner} alt="" onError={() => setBannerLoadFailed(true)} className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0 bg-slate-950" aria-hidden="true" />
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-950/60 to-transparent" aria-hidden="true" />
          <div className="relative z-10 flex w-full flex-col items-start gap-3 px-4 pb-8 pt-6 text-left md:px-6">
            <span className="px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-[#F59E0B] bg-[#F59E0B]/10 border border-[#F59E0B]/40 rounded-md">{lessonLevel} - MODULE {lessonModuleNumber ?? 1}</span>
            <h1 className="font-sans text-2xl font-bold text-[#f1eee8] md:text-3xl">
              {displayLessonTitle || lesson.title}
            </h1>
            {lessonSubtitle && <p className="text-xs text-[#b5bac2]">{lessonSubtitle}</p>}
            <div className="mt-7 flex items-center gap-2 text-[11px] text-[#9ba1aa]"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#283344] text-[9px] font-semibold text-[#d9a63b]">{instructor.initials}</span>Guided by {instructor.fullName}</div>
            <div className="w-12 h-12 rounded-full border-2 border-[#F59E0B] bg-transparent flex items-center justify-center p-1.5 mt-3"><img src="/logo.png" alt="Fluentia" className="w-full h-full object-contain" /></div>
          </div>
        </section>
      )}

            <div className="py-8">
            <header>
        <div className="flex flex-wrap items-center justify-between gap-3 text-[12px]">
          <p className="text-[#aeb2b9]">Welcome back, <span className="text-[#e6e4e0]">{studentDisplayName}</span>.</p>
          <div className="flex flex-wrap items-center gap-2">
            <AmbientMusicPlayer src={lessonContent.ambientMusicUrl} tracks={lessonContent.ambientTracks} />
            {((typeof lesson.instructor_note === "string" && lesson.instructor_note.trim()) || (typeof rawLessonContent.instructorGuidance === "string" && rawLessonContent.instructorGuidance.trim())) && <button type="button" onClick={() => setGuidanceOpen((open) => !open)} aria-expanded={guidanceOpen} aria-label="Open lesson guidance" title="Lesson Guidance" className={`flex h-8 w-8 items-center justify-center rounded-md border text-amber-300 transition ${guidanceOpen ? "border-amber-500/70 bg-amber-500/10" : "border-[#394252] bg-[#171d28]/90 hover:border-amber-500"}`}><Lightbulb className="h-4 w-4" /></button>}
            <button type="button" onClick={() => setSidebarOpen((open) => !open)} aria-expanded={sidebarOpen} aria-controls="learning-sidebar" className={`flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs transition ${sidebarOpen ? "border-amber-500/70 bg-amber-500/10 text-amber-300" : "border-[#394252] bg-[#171d28]/90 text-amber-300 hover:border-amber-500"}`}><PanelRight className="h-3.5 w-3.5" />Learning Hub</button>
            <button type="button" onClick={() => setDictionaryWord("")} aria-label="Open dictionary" className="flex h-8 w-8 items-center justify-center rounded-md border border-[#394252] bg-[#171d28]/90 text-stone-400 transition hover:border-amber-500 hover:text-amber-300"><BookOpen className="w-4 h-4" /></button>
            <Link href="/dashboard" className="flex items-center gap-1 rounded-md border border-[#394252] bg-[#171d28]/90 px-3 py-2 text-xs text-[#b5bac2] transition-colors hover:border-amber-500/50 hover:text-amber-300"><ChevronRight className="h-3 w-3 rotate-180" />Course overview</Link>
          </div>
        </div>
        <div className="mt-8">
          <p className="mb-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#556078]">Your journey</p>
          <Stepper
            currentStep={currentStep}
            completedSteps={completedSteps}
            lockedSteps={stepperLockedSteps}
            onStepClick={handleStepClick}
          />
        </div>
      </header>
      <div className="w-full">
      <div className="w-full">

      <main className="pb-10 pt-8 text-[15px] leading-relaxed">
        {/* Hero Banner */}
        <div className="border-t border-[#202631]" />

        {/* Step Content */}
        <div className="space-y-7 pt-9">
          {/* Warm Up */}
          {currentStep === "warm_up" && (
            <section className="space-y-5">
              {lessonContent.warm_up?.blocks?.length ? renderDynamicBlocks(lessonContent.warm_up.blocks) : <>
              {(lessonContent.warm_up?.intro_narrative?.text || lessonContent.warm_up?.quote?.text || lessonContent.warm_up?.quick_prompts?.length) && <div id="lesson-content" className="flex items-center gap-2 text-[#d99d22]">
                <Sparkles className="h-3.5 w-3.5 fill-current" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">Warm-up</span>
              </div>}
              {lessonContent.warm_up?.intro_narrative?.text && <p className="max-w-[570px] text-[16px] leading-[1.65] text-[#aeb3bb]">{lessonContent.warm_up.intro_narrative.text}</p>}
              {lessonContent.warm_up?.quote?.text && <h3 className="pt-4 font-sans text-[27px] font-semibold leading-[1.18] text-[#eeeae3]">{lessonContent.warm_up.quote.text}</h3>}
              <div className="space-y-2 text-sm text-[#aeb3bb]">
                {(lessonContent.warm_up?.quick_prompts || []).map((prompt: { text: string }) => (
                  <p key={prompt.text}>{prompt.text}</p>
                ))}
              </div>
              <textarea
                value={submission.blockResponses?.warm_up || ""}
                onChange={(event) => void persistSubmission({ ...submission, blockResponses: { ...(submission.blockResponses || {}), warm_up: event.target.value } })}
                className="mt-2 w-full min-h-[200px] resize-y rounded-[10px] border border-[#29303c] bg-[#171d28] px-5 py-5 text-[15px] leading-relaxed text-[#d9dce0] placeholder-[#7b8290] shadow-[0_8px_24px_rgba(0,0,0,.12)] transition-colors placeholder:text-[13px] focus:border-[#8d702f] focus:outline-none focus:ring-1 focus:ring-[#8d702f]/30"
                rows={8}
                placeholder=""
              />
              {lessonContent.warm_up?.lexicon_notes?.text && (
                <p id="lexicon-notes" className="text-[12px] leading-relaxed text-amber-400">
                  {lessonContent.warm_up.lexicon_notes.text}
                </p>
              )}
              </>}
            </section>
          )}

          {/* Lesson */}
          {currentStep === "lesson" && (
            <section className="space-y-4">
              {lessonContent.lesson?.blocks?.length ? renderDynamicBlocks(lessonContent.lesson.blocks) : <>
              {lessonContent.lesson?.core_concept?.text && <div className="flex items-center gap-2 text-amber-400">
                <BookOpen className="w-5 h-5" />
                <span className="text-xs font-semibold uppercase tracking-wider">
                  Core Lesson
                </span>
              </div>}
              {lessonContent.lesson?.core_concept?.text && <h3 className="text-xl font-semibold text-stone-100">{lessonContent.lesson.core_concept.text}</h3>}
              <div className="grid sm:grid-cols-3 gap-4">
                {(lessonContent.lesson?.examples || []).map((item: { text: string }, index: number) => (
                  <div
                    key={`${item.text}-${index}`}
                    className="bg-stone-900 border border-stone-800 rounded-xl p-4 space-y-2"
                  >
                    <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
                      Example {index + 1}
                    </p>
                    <p className="text-sm text-stone-400 leading-relaxed">{item.text}</p>
                  </div>
                ))}
              </div>
              </>}
            </section>
          )}

          {/* Listening */}
          {currentStep === "listening" && (
            <section className="space-y-4">
              {lessonContent.listening?.blocks?.length ? renderDynamicBlocks(lessonContent.listening.blocks) : <>
              {(lessonContent.listening?.audio_url || lessonContent.listening?.transcript?.text || lessonContent.listening?.questions?.length) && <div className="flex items-center gap-2 text-amber-400">
                <Headphones className="w-5 h-5" />
                <span className="text-xs font-semibold uppercase tracking-wider">
                  Audio Immersion
                </span>
              </div>}
              {lessonContent.listening?.transcript?.text && <h3 className="text-xl font-semibold text-stone-100">{lessonContent.listening.transcript.text}</h3>}
              {lessonContent.listening?.audio_url && <CustomAudioPlayer src={lessonContent.listening.audio_url} label="Listening audio" />}
              <div className="space-y-3">
                {(lessonContent.listening?.questions || []).map((question: { id: string; question: string; options?: string[] }) => (
                  <div key={question.id} className="rounded-xl border border-[#202631] bg-[#121721] p-4">
                    <p className="text-sm text-stone-300">{question.question}</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {(question.options || []).map((option: string) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => persistSubmission({ ...submission, listeningAnswers: { ...submission.listeningAnswers, [question.id]: option } })}
                          className={`rounded-md border px-3 py-2 text-left text-xs transition ${submission.listeningAnswers[question.id] === option ? "border-amber-500 bg-amber-500/10 text-amber-300" : "border-[#202631] bg-[#0c1017] text-stone-400 hover:border-amber-500/50"}`}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              </>}
            </section>
          )}

          {/* Reading */}
          {currentStep === "reading" && (
            <section className="space-y-4">
              {lessonContent.reading?.blocks?.length ? renderDynamicBlocks(lessonContent.reading.blocks) : <>
              {(lessonContent.reading?.article_markdown?.text || lessonContent.reading?.lexicon_notes?.text || lessonContent.reading?.vocabulary_drawer?.length || lessonContent.reading?.analytical_questions?.length) && <div className="flex items-center gap-2 text-amber-400">
                <FileText className="w-5 h-5" />
                <span className="text-xs font-semibold uppercase tracking-wider">
                  Reading
                </span>
              </div>}
              {lessonContent.reading?.article_markdown?.text && <blockquote className="border-l-2 border-amber-500/40 pl-4 text-stone-400 text-sm leading-relaxed italic">{lessonContent.reading.article_markdown.text}</blockquote>}
              {lessonContent.reading?.lexicon_notes?.text && (
                <div className="rounded-lg border border-[#202631] bg-[#121721] p-4 text-sm leading-relaxed text-stone-300">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-amber-400">Reading Lexicon</p>
                  {lessonContent.reading.lexicon_notes.text}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {(lessonContent.reading?.vocabulary_drawer || []).map((item: { word: string; definition: string }) => (
                  <span key={item.word} className="rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-xs text-amber-300">
                    {item.word}: {item.definition}
                  </span>
                ))}
              </div>
              <div className="space-y-3">
                {(lessonContent.reading?.analytical_questions || []).map((question: { id: string; question: string }) => (
                  <label key={question.id} className="block text-xs text-stone-400">
                    {question.question}
                    <textarea
                      value={submission.readingAnswers[question.id] || ""}
                      onChange={(event) => persistSubmission({ ...submission, readingAnswers: { ...submission.readingAnswers, [question.id]: event.target.value } })}
                      rows={3}
                      placeholder="Write your answer here..."
                      className="mt-1 w-full resize-none rounded-xl border border-stone-700/60 bg-stone-900 px-4 py-3 text-sm text-stone-200 placeholder-stone-600 focus:border-amber-500/40 focus:outline-none"
                    />
                  </label>
                ))}
              </div>
              </>}
            </section>
          )}

          {/* Writing */}
          {currentStep === "writing" && (
            <section className="space-y-4">
              {lessonContent.writing?.blocks?.length ? renderDynamicBlocks(lessonContent.writing.blocks) : <>
              {(lessonContent.writing?.prompt?.text || lessonContent.writing?.draft_editor?.enabled) && <div className="flex items-center gap-2 text-amber-400">
                <PenTool className="w-5 h-5" />
                <span className="text-xs font-semibold uppercase tracking-wider">
                  Writing Task
                </span>
              </div>}
              {lessonContent.writing?.prompt?.text && <p className="text-stone-400 text-sm leading-relaxed">{lessonContent.writing.prompt.text}</p>}
              <textarea
                value={submission.writingText}
                onChange={(event) => persistSubmission({ ...submission, writingText: event.target.value })}
                className="w-full min-h-[200px] bg-stone-900 border border-stone-700/60 rounded-xl px-4 py-3 text-sm text-stone-200 placeholder-stone-600 resize-y focus:outline-none focus:ring-1 focus:ring-amber-500/40 focus:border-amber-500/40 transition-colors"
                rows={8}
                placeholder={lessonContent.writing?.draft_editor?.placeholder || "Write your response here..."}
              />
              </>}
            </section>
          )}

          {/* Speaking */}
          {currentStep === "speaking" && (
            <section className="space-y-4">
              {lessonContent.speaking?.blocks?.length ? renderDynamicBlocks(lessonContent.speaking.blocks) : <>
              {(lessonContent.speaking?.scenario?.text || lessonContent.speaking?.discussion_points?.length || lessonContent.speaking?.audio_capture?.enabled) && <div className="flex items-center gap-2 text-amber-400">
                <Mic className="w-5 h-5" />
                <span className="text-xs font-semibold uppercase tracking-wider">
                  Speaking
                </span>
              </div>}
              {lessonContent.speaking?.scenario?.text && <p className="text-stone-400 text-sm leading-relaxed">{lessonContent.speaking.scenario.text}</p>}
              <div className="space-y-2 text-left text-sm text-stone-400">
                {(lessonContent.speaking?.discussion_points || []).map((point: { text: string }) => (
                  <p key={point.text}>{point.text}</p>
                ))}
              </div>
              {!lessonContent.speaking?.blocks?.length && (
                <AudioResponseBlock
                  studentId={activeStudent?.id}
                  value={submission.speakingAudioUrl || submission.audioUploads?.speaking}
                  onChange={(value) => void persistSubmission({ ...submission, speakingAudioUrl: value, audioUploads: { ...(submission.audioUploads || {}), speaking: value } })}
                />
              )}
              </>}
            </section>
          )}

          {/* Results */}
          {currentStep === "results" && (
            <section className="mx-auto max-w-6xl space-y-6 py-8">
              <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto">
                <Award className="w-8 h-8 text-amber-400" />
              </div>
              <div className="space-y-2 text-center">
                <h3 className="text-2xl font-sans font-semibold text-stone-100">
                  Lesson Submitted &amp; Completed!
                </h3>
                {lessonContent.results?.self_reflection?.text && <p className="text-stone-400 text-sm">{lessonContent.results.self_reflection.text}</p>}
              </div>
              <div className="grid gap-4 text-left md:grid-cols-2">
                {benchmarkResults.answer_keys && <div className="rounded-xl border border-[#202631] bg-[#121721] p-5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Answer Keys</p>
                  <div className="mt-3 space-y-3 text-sm text-stone-300">
                    {Object.entries(benchmarkResults.answer_keys).map(([section, answers]) => (
                      <div key={section}>
                        <p className="text-xs font-semibold capitalize text-stone-400">{section.replaceAll("_", " ")}</p>
                        {Object.entries(answers).map(([questionId, answer]) => <p key={questionId} className="mt-1"><span className="text-stone-500">{questionId}:</span> {answer}</p>)}
                      </div>
                    ))}
                  </div>
                </div>}
                {benchmarkResults.quiz_breakdown?.length ? <div className="rounded-xl border border-[#202631] bg-[#121721] p-5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Quiz Breakdown</p>
                  <div className="mt-3 space-y-3 text-sm text-stone-300">
                    {benchmarkResults.quiz_breakdown.map((item) => <div key={item.questionId}><p className="text-xs text-stone-500">{item.skill}</p><p className="mt-1">{item.questionId}: <span className="text-amber-200">{item.correctResponse}</span></p></div>)}
                  </div>
                </div> : null}
              </div>
              {resultSummary?.type === "text" && <div className="rounded-xl border border-[#202631] bg-[#121721] p-5 text-left">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Summary</p>
                <MarkdownContent value={resultSummary.body} className="mt-3 text-sm leading-relaxed text-stone-300" />
              </div>}
              {benchmarkResults.feedback_notes && <div className="rounded-xl border border-[#202631] bg-[#121721] p-5 text-left">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Review Notes</p>
                <div className="mt-3 grid gap-3 text-sm text-stone-400 sm:grid-cols-3">
                  {Object.entries(benchmarkResults.feedback_notes).map(([section, note]) => <p key={section}><span className="block text-xs font-semibold capitalize text-stone-300">{section.replaceAll("_", " ")}</span>{note}</p>)}
                </div>
              </div>}
              {benchmarkResults.instructor_feedback && <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5 text-left">
                <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Instructor Feedback</p><span className="rounded border border-amber-500/30 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-amber-300">{benchmarkResults.instructor_feedback.status || "pending"}</span></div>
                <p className="mt-3 text-sm text-stone-400">Your instructor feedback will appear here after your writing and speaking responses are reviewed.</p>
              </div>}
              <div className="space-y-3 text-left">
                {stepResults.map((result) => (
                  <div key={result.id} className="grid gap-3 rounded-xl border border-[#202631] bg-[#121721] p-4 md:grid-cols-[150px_1fr]">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">{result.step}</p>
                      {result.prompt && <p className="mt-2 whitespace-pre-wrap text-xs text-stone-500">{result.prompt}</p>}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.1em] text-stone-500">Your response</p>
                        {result.answer && (result.answer.startsWith("http") || result.answer.startsWith("blob:") || result.answer.endsWith(".webm") || result.answer.endsWith(".mp3") || result.answer.endsWith(".wav")) ? <CustomAudioPlayer src={result.answer} label="Your speaking recording" /> : <p className="mt-1 whitespace-pre-wrap text-sm text-stone-300">{result.answer || "No response submitted"}</p>}
                      </div>
                      {result.referenceAnswer && <div>
                        <p className="text-[10px] uppercase tracking-[0.1em] text-amber-500/80">Reference / Correct Answer</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-amber-200">{result.referenceAnswer}</p>
                      </div>}
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-[#202631] bg-[#121721] p-5 text-left">
                <div className="flex flex-col gap-3 border-b border-[#202631] pb-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Instructor Summary &amp; Recommendations</p>
                    <h4 className="mt-1 text-lg font-semibold text-stone-100">Your performance review</h4>
                  </div>
                  <span className={`w-fit rounded-sm border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                    isEvaluationPublished
                      ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                      : "border-[#394252] bg-[#171d28] text-stone-400"
                  }`}>
                    {isEvaluationPublished ? "Reviewed" : "Pending Review"}
                  </span>
                </div>
                <div className="grid gap-5 pt-4 md:grid-cols-[180px_1fr]">
                  <div>
                    <p className="text-xs text-stone-500">Overall assessment</p>
                    <p className="mt-1 text-3xl font-semibold text-amber-400">{isEvaluationPublished ? `${totalScore}/20` : "--"}</p>
                    <p className="mt-1 text-xs text-stone-500">Rubric score</p>
                  </div>
                  <div className="space-y-4 text-sm text-stone-400">
                    {isEvaluationPublished && evaluation?.comments && <p>{evaluation.comments}</p>}
                    {isEvaluationPublished && (
                      <div className="grid gap-4 border-t border-[#202631] pt-4 sm:grid-cols-2">
                        {evaluation?.strengths && <div><p className="text-xs font-semibold text-stone-300">Strengths</p><p className="mt-1 whitespace-pre-wrap">{evaluation.strengths}</p></div>}
                        {evaluation?.areasToImprove && <div><p className="text-xs font-semibold text-stone-300">Areas to Improve</p><p className="mt-1 whitespace-pre-wrap">{evaluation.areasToImprove}</p></div>}
                        {evaluation?.studyHubPrescription && <div><p className="text-xs font-semibold text-stone-300">Study Hub Prescription</p><p className="mt-1 whitespace-pre-wrap text-amber-300">{evaluation.studyHubPrescription}</p></div>}
                        {evaluation?.voiceFeedbackUrl && <div><p className="text-xs font-semibold text-stone-300">Voice Feedback</p><a href={evaluation.voiceFeedbackUrl} className="mt-1 block truncate text-amber-300">{evaluation.voiceFeedbackUrl}</a></div>}
                      </div>
                    )}
                    {(lessonContent.warm_up?.lexicon_notes?.text || lessonContent.lesson || lessonContent.reading || lessonContent.writing || lessonContent.speaking) && <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">Recommended review</p>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => { setSidebarOpen(true); }} className="rounded-md border border-amber-500/20 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-300 hover:bg-amber-500/20">Review lexicon notes</button>
                        <button type="button" onClick={() => setCurrentStep("warm_up")} className="rounded-md border border-[#394252] bg-[#171d28] px-2.5 py-1.5 text-xs text-stone-300 hover:border-amber-500/40">Revisit lesson content</button>
                      </div>
                    </div>}
                  </div>
                </div>
              </div>

              <div className="text-center">
                <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-full border border-stone-700 bg-stone-800 px-5 py-2.5 text-sm text-stone-200 transition-colors hover:bg-stone-700">
                  Return to Dashboard
                </Link>
              </div>
            </section>
          )}
        </div>







        {/* Bottom Navigation */}
        {!isResultsStep && (
          <div className="flex items-center justify-between border-t border-[#202631] pt-8">
            <button
              onClick={handlePrev}
              disabled={currentIndex === 0}
              className="px-0 py-2 text-[11px] text-[#566078] transition-colors hover:text-[#b3b8c1] disabled:cursor-not-allowed disabled:opacity-30"
            >
              Previous
            </button>
            <button
              onClick={handleNext}
              className="flex items-center gap-2 rounded-lg bg-amber-500 px-6 py-2.5 text-[12px] font-bold text-slate-950 shadow-md transition-all hover:bg-amber-400"
            >
              {currentIndex === STUDY_STEPS.length - 2 ? (
                <>
                  Next <ArrowRight className="w-4 h-4" />
                </>
              ) : (
                <>
                  Next <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        )}
      </main>
          </div>
        </div>
      </div>

      </div>
      <CelebrationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleSubmitFinal}
        onReview={handleReviewAnswers}
        studentName={studentDisplayName}
        dashboardHref="/dashboard"
        stepResults={stepResults}
      />
      <LearningSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        words={savedWords}
        notes={notes}
        resource={evaluation?.studyHubPrescription} resources={lessonPageResources}
        onSaveNote={(note) => {
          setNotes([note, ...notes.filter((item) => item.id !== note.id)]);
          void saveStudentNote(lessonStudentToken, note);
        }}
        onRemoveWord={(word) => {
          setSavedWords(savedWords.filter((item) => item.word.toLowerCase() !== word.toLowerCase()));
          void removeVocabularyWord(lessonStudentToken, word);
        }}
      />
      <ChatWidget
        messages={chatMessages}
        onSend={(message) => {
          setChatMessages([...chatMessages, message]);
          void saveChatMessage(lessonStudentToken, message);
        }}
      />
      <div className={`fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm transition-opacity duration-300 ease-in-out ${guidanceOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`} role="presentation" onClick={() => setGuidanceOpen(false)} aria-hidden={!guidanceOpen}>
        <aside className={`absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-amber-500/20 bg-[#0c1017]/95 p-5 text-stone-200 shadow-2xl backdrop-blur-md transition-transform duration-300 ease-in-out ${guidanceOpen ? "translate-x-0" : "translate-x-full"}`} role="dialog" aria-modal={guidanceOpen} aria-labelledby="lesson-guidance-title" onClick={(event) => event.stopPropagation()}>
          <div className="flex items-center justify-between border-b border-[#293343] pb-4"><h2 id="lesson-guidance-title" className="flex items-center gap-2 text-sm font-semibold text-amber-300"><Lightbulb className="h-4 w-4" />Lesson Guidance</h2><button type="button" onClick={() => setGuidanceOpen(false)} aria-label="Close lesson guidance" className="rounded-md p-2 text-stone-400 transition hover:bg-white/10 hover:text-stone-100"><X className="h-4 w-4" /></button></div>
          <div className="min-h-0 flex-1 overflow-y-auto py-5"><MarkdownContent value={(lesson.instructor_note || rawLessonContent.instructorGuidance) as string} className="text-sm leading-relaxed text-stone-300" /></div>
        </aside>
      </div>
      {dictionaryWord !== null && (
        <DictionaryModal
          initialWord={dictionaryWord}
          savedWords={savedWords}
          onClose={() => setDictionaryWord(null)}
          onSave={(word) => {
            setSavedWords([word, ...savedWords.filter((item) => item.word.toLowerCase() !== word.word.toLowerCase())]);
            void saveVocabularyWord(lessonStudentToken, word);
          }}
        />
      )}
      <button aria-label="Help" className="fixed bottom-3 right-3 flex h-7 w-7 items-center justify-center rounded-full border border-[#3a3e45] bg-[#25282d] text-xs text-[#b5b7ba] shadow-lg">
        ?
      </button>
    </div>
  );
}
