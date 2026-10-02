"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ChatMessage, ContentBlock, SavedVocabularyWord, StudentNote, StudyStepId, STUDY_STEPS, LessonContent, StudentSubmission } from "@/types/lesson";
import { getLessonById, type LessonWithVersion } from "@/lib/lessons";
import { getLessonStateKey, PublishedLessonState, writeLastAccessedLesson } from "@/lib/lesson-store";
import { fetchLesson, fetchLessonState, fetchSavedVocabulary, fetchStudentNotes, fetchStudentProgress, saveChatMessage, saveStudentNote, saveStudentSubmissionDraft, submitStudentLesson, removeVocabularyWord, saveVocabularyWord } from "@/services/storage-service";
import { FLUENTIA_USERS, INSTRUCTOR_USER, type StudentUser } from "@/lib/users";
import { supabase } from "@/lib/supabase";
import { Stepper } from "@/components/study-room/stepper";
import { CelebrationModal, StepResult } from "@/components/study-room/celebration-modal";
import { DictionaryModal } from "@/components/study-room/dictionary-modal";
import { LearningSidebar } from "@/components/study-room/learning-sidebar";
import { ChatWidget } from "@/components/study-room/chat-widget";
import { AccessCard } from "@/components/access/access-card";
import { AmbientMusicPlayer } from "@/components/study-room/ambient-music-player";
import { StudyRoomTimer } from "@/components/study-room/study-room-timer";
import { MarkdownContent } from "@/components/study-room/markdown-content";
import { CustomAudioPlayer } from "@/components/study-room/custom-audio-player";
import { UnifiedReportCard, type UnifiedReportStage } from "@/components/shared/unified-report-card";
import { InteractiveVideoBlock } from "@/components/shared/interactive-video-block";
import { FillInBlanksMarkdown } from "@/components/study-room/fill-in-blanks-markdown";
import { getBannerPositionStyles, normalizeBannerPosition } from "@/lib/banner-position";
import { ExerciseQuestions } from "@/components/study-room/exercise-questions";
import { WritingBlockRenderer } from "@/components/shared/writing-block";
import { StudyRoomBlockRow } from "@/components/study-room/study-room-block-row";
import { Tooltip } from "@/components/shared/tooltip";
import { DisplaySettingsControl } from "@/components/shared/display-settings";
import { DynamicLucideIcon } from "@/components/shared/lucide-icon-picker";
import { parseFillInBlanks } from "@/lib/fill-in-blanks";
import { uploadStudentAudio } from "@/services/storage-service";
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
  return <div className="mt-4 rounded-lg border border-[#202631] bg-[#0c1017] p-3"><label className="inline-flex cursor-pointer items-center rounded-md border border-[#394252] px-3 py-2 text-xs text-stone-300 hover:border-amber-500/40 hover:text-amber-400">{isUploading ? "Uploading..." : "Upload File"}<input type="file" onChange={(event) => void upload(event.target.files?.[0])} disabled={isUploading} className="sr-only" /></label>{value && <p className="mt-2 truncate text-xs text-emerald-300">File uploaded</p>}{error && <p className="mt-2 text-xs text-red-300">{error}</p>}</div>;
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
            className={`relative flex h-11 w-11 items-center justify-center rounded-full shadow-sm transition active:scale-95 disabled:opacity-40 ${isRecording ? "bg-red-500 text-white hover:bg-red-400" : "bg-amber-500/20 text-amber-400 hover:bg-amber-500/20"}`}
          >
            {isRecording ? <Square className="h-3.5 w-3.5 fill-current" /> : <Mic className="h-4 w-4" />}
          </button>
        </div>
        <div className="mx-4 flex h-8 min-w-0 flex-1 items-center gap-px overflow-hidden rounded-full bg-slate-700/50 px-2" aria-hidden>
          {isRecording ? (
            levels.map((h, i) => <span key={i} className="min-w-0 flex-1 rounded-full bg-amber-500/20 shadow-[0_0_8px_rgba(251,191,36,0.22)] transition-[height] duration-100 ease-linear" style={{ height: Math.max(4, h) }} />)
          ) : (
            <span className="h-1.5 w-full rounded-full bg-slate-800/80" />
          )}
        </div>
        <span className={`shrink-0 font-mono text-xs tabular-nums ${isRecording ? "text-stone-300" : "text-stone-500"}`}>{isRecording ? fmt(elapsed) : fmtInt(0)}</span>
      </div>
      <div className="flex items-center gap-2">
        <label className={`inline-flex cursor-pointer items-center rounded-md border px-3 py-1.5 text-xs font-medium transition ${isUploading||isRecording?"pointer-events-none border-[#202631] text-stone-500 opacity-50":"border-[#394252] text-stone-300 hover:border-amber-500/40 hover:text-amber-400"}`}>
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
  const [isOpen, setIsOpen] = useState(true);
  const contentId = useId();

  useEffect(() => {
    setIsOpen(isUnlocked);
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
    <div className="mt-4 rounded-md border border-amber-500/40 bg-[#0c1017]">
      <button type="button" onClick={() => setIsOpen((open) => !open)} aria-expanded={isOpen} aria-controls={contentId} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs  text-amber-400">
        <Unlock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Transcript
        <ChevronDown className={`ml-auto h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      <div className={`overflow-hidden transition-[max-height,opacity] duration-300 ease-out ${isOpen ? "max-h-[350px] opacity-100" : "max-h-0 opacity-0"}`}>
        <div id={contentId} className="max-h-[350px] overflow-y-auto border-t border-[#293343] px-3 py-3 pr-2">
          {transcript?.trim() ? <MarkdownContent value={transcript} className="text-sm leading-relaxed text-stone-300" /> : <p className="text-xs text-stone-500">No transcript was provided for this media.</p>}
        </div>
      </div>
    </div>
  );
}

type SubmissionProgressUpdate = {
  currentStep?: StudyStepId;
  completedSteps?: StudyStepId[];
  status?: "not_started" | "in_progress" | "submitted" | "pending_evaluation" | "reviewed" | "evaluated";
};

type QueuedSubmissionSave = {
  submission: StudentSubmission;
  progress: SubmissionProgressUpdate;
  resolve: (saved: boolean) => void;
};

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [publishedLesson, setPublishedLesson] = useState<PublishedLessonState | null>(null);
  const [submission, setSubmission] = useState<StudentSubmission>({
    status: "in_progress",
    listeningAnswers: {},
    readingAnswers: {},
    writingText: "",
    writing_responses: {},
    blockResponses: {},
    quizSelections: {},
    audioUploads: {},
  });
  const submissionSaveQueue = useRef<Promise<void>>(Promise.resolve());
  const submissionSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSubmissionSave = useRef<QueuedSubmissionSave | null>(null);
  const [visibleSampleAnswers, setVisibleSampleAnswers] = useState<Record<string, boolean>>({});
  const [savedWords, setSavedWords] = useState<SavedVocabularyWord[]>([]);
  const [notes, setNotes] = useState<StudentNote[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [dictionaryWord, setDictionaryWord] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [guidanceOpen, setGuidanceOpen] = useState(false);
  const [submissionSaveError, setSubmissionSaveError] = useState<string | null>(null);
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
      writing_responses: {},
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
      const canShowResults = hydratedSubmission?.status === "submitted" || hydratedSubmission?.status === "pending_evaluation" || hydratedSubmission?.status === "reviewed" || hydratedSubmission?.status === "evaluated";
      const requestedNonResultsStep = requestedStep && requestedStep !== "results" ? requestedStep : null;
      const persistedStep = progress.currentStep !== "results" || canShowResults ? progress.currentStep : "warm_up";
      setPublishedLesson(state?.status !== "draft" ? state : null);
      setSubmission(hydratedSubmission || {
        status: "in_progress",
        listeningAnswers: {},
        readingAnswers: {},
        writingText: "",
        writing_responses: {},
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

  async function persistSubmissionNow(nextSubmission: StudentSubmission, nextProgress: SubmissionProgressUpdate, optimistic: boolean): Promise<boolean> {
    if (!lesson) return false;
    const isFinalSubmission = nextSubmission.status === "submitted" || nextSubmission.status === "pending_evaluation" || nextSubmission.status === "reviewed" || nextSubmission.status === "evaluated";
    try {
      const tok = activeStudent?.token ?? lesson.student_token ?? undefined;
      const progress = {
        currentStep: nextProgress.currentStep || currentStep,
        completedSteps: nextProgress.completedSteps || completedSteps,
        status: nextProgress.status || (isFinalSubmission ? nextSubmission.status : "in_progress"),
        updatedAt: new Date().toISOString(),
      };
      const save = submissionSaveQueue.current.then(() => isFinalSubmission
        ? submitStudentLesson(lesson.id, tok, nextSubmission, progress)
        : saveStudentSubmissionDraft(lesson.id, tok, nextSubmission, progress));
      submissionSaveQueue.current = save.then(() => undefined, () => undefined);
      await save;
      if (!optimistic) setSubmission(nextSubmission);
      return true;
    } catch (error) {
      if (isFinalSubmission) {
        console.error("[Lesson Submission] Failed to persist final submission:", {
          lessonId: lesson.id,
          studentId: activeStudent?.id || lesson.student_id,
          error,
        });
        setSubmissionSaveError(error instanceof Error ? error.message : String(error));
      } else if (process.env.NODE_ENV === "development") {
        console.warn("[Lesson Autosave] Draft save failed; the latest local answers are retained.", error);
      }
      return false;
    }
  }

  function flushPendingSubmissionSave(): Promise<boolean> {
    if (submissionSaveTimer.current) clearTimeout(submissionSaveTimer.current);
    submissionSaveTimer.current = null;
    const queued = pendingSubmissionSave.current;
    pendingSubmissionSave.current = null;
    if (!queued) return Promise.resolve(false);
    const save = persistSubmissionNow(queued.submission, queued.progress, true);
    void save.then(queued.resolve);
    return save;
  }

  function persistSubmission(
    nextSubmission: StudentSubmission,
    nextProgress?: SubmissionProgressUpdate,
    optimistic = true,
    immediate = false,
  ): Promise<boolean> {
    if (!lesson) return Promise.resolve(false);
    if (optimistic) setSubmission(nextSubmission);
    if (nextSubmission.status === "pending_evaluation" || nextSubmission.status === "submitted") setSubmissionSaveError(null);
    const progress = {
      currentStep: nextProgress?.currentStep || currentStep,
      completedSteps: nextProgress?.completedSteps || completedSteps,
      status: nextProgress?.status || (nextSubmission.status === "submitted" || nextSubmission.status === "pending_evaluation" || nextSubmission.status === "evaluated" ? nextSubmission.status : "in_progress"),
    };
    return new Promise((resolve) => {
      if (submissionSaveTimer.current) clearTimeout(submissionSaveTimer.current);
      pendingSubmissionSave.current?.resolve(false);
      pendingSubmissionSave.current = { submission: nextSubmission, progress, resolve };
      if (immediate) {
        void flushPendingSubmissionSave();
      } else {
        submissionSaveTimer.current = setTimeout(() => {
          submissionSaveTimer.current = null;
          void flushPendingSubmissionSave();
        }, 500);
      }
    });
  }

  useEffect(() => () => {
    if (submissionSaveTimer.current) clearTimeout(submissionSaveTimer.current);
    submissionSaveTimer.current = null;
    const queued = pendingSubmissionSave.current;
    pendingSubmissionSave.current = null;
    if (queued) {
      void persistSubmissionNow(queued.submission, queued.progress, true).then(queued.resolve);
    }
  }, [lesson?.id, activeStudent?.token]);

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
    : typeof lessonContent.bannerUrl === "string"
      ? lessonContent.bannerUrl
      : typeof lesson?.banner_url === "string"
        ? lesson.banner_url
        : undefined;
  const heroBanner = bannerLoadFailed ? undefined : lessonBanner;
  const rawBannerPosition = rawLessonContent.bannerPosition ?? rawLessonContent.banner_position;
  const bannerPosition = normalizeBannerPosition(rawBannerPosition);
  const evaluation = publishedLesson?.evaluation;
  const isEvaluationPublished = evaluation?.published === true;
  const totalScore = evaluation?.totalScore ?? (evaluation
    ? Object.values(evaluation.scores).reduce<number>((total, score) => total + Number(score), 0)
    : 0);
  const stripMarkdown = (value: string) => value
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(`{1,3})(.*?)\1/g, "$2")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1$2")
    .replace(/(^|[^_])_([^_\n]+)_(?!_)/g, "$1$2")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/<[^>]*>/g, "")
    .replace(/[*_~`]/g, "")
    .trim();

  const getStepResponses = (step: Exclude<StudyStepId, "results">) => {
    const responses: StepResult["responses"] = [];
    const addResponse = (
      question: string,
      value?: string,
      correctAnswer?: string,
      explanation?: string,
      mediaUrls?: string[],
      responseId?: string,
      acceptedAnswers?: string[],
      caseSensitive = false,
      autoCheck = true,
    ) => {
      const cleanedQuestion = stripMarkdown(question);
      const cleanedMediaUrls = (mediaUrls || []).filter(Boolean);
      const cleanedAnswer = value && /^(https?:|blob:)/i.test(value.trim())
        ? "Response submitted"
        : stripMarkdown(value || "");
      const cleanedCorrectAnswer = correctAnswer ? stripMarkdown(correctAnswer) : undefined;
      const cleanedExplanation = explanation ? stripMarkdown(explanation) : undefined;
      if (responses.some((response) => response.question === cleanedQuestion && response.answer === cleanedAnswer && response.mediaUrls?.join() === cleanedMediaUrls.join())) return;
      const normalizedAnswer = caseSensitive ? cleanedAnswer : cleanedAnswer.toLocaleLowerCase();
      const isCorrect = autoCheck && cleanedAnswer && cleanedCorrectAnswer
        ? (acceptedAnswers?.length ? acceptedAnswers : [cleanedCorrectAnswer]).some((answer) => {
          const normalizedExpected = stripMarkdown(answer);
          return caseSensitive
            ? cleanedAnswer === normalizedExpected
            : normalizedAnswer === normalizedExpected.toLocaleLowerCase();
        })
        : undefined;
      responses.push({
        id: responseId || question,
        question: cleanedQuestion,
        answer: cleanedAnswer,
        correctAnswer: cleanedCorrectAnswer || undefined,
        explanation: cleanedExplanation || undefined,
        isCorrect,
        mediaUrls: cleanedMediaUrls.length ? cleanedMediaUrls : undefined,
      });
    };
    const blocks = ((lessonContent[step] as { blocks?: ContentBlock[] } | undefined)?.blocks || [])
      .filter((block) => block.is_active !== false && block.enabled !== false);
    if (blocks.length === 0) {
      if (step === "warm_up") {
        addResponse(lessonContent.warm_up?.prompt?.text || "Warm-up reflection", submission.blockResponses?.warm_up, undefined, undefined, undefined, "warm_up");
      } else if (step === "listening") {
        (lessonContent.listening?.questions || []).filter((question: { options?: string[] }) => question.options?.some(Boolean)).forEach((question: { id: string; question: string; options?: string[]; correct_answer?: string; explanation?: string }) => addResponse(
          question.question,
          submission.listeningAnswers?.[question.id],
          question.correct_answer || lessonContent.results?.answer_keys?.listening?.[question.id],
          question.explanation,
          undefined,
          question.id,
        ));
      } else if (step === "reading") {
        (lessonContent.reading?.analytical_questions || []).forEach((question: { id: string; question: string; explanation?: string }) => addResponse(
          question.question,
          submission.readingAnswers?.[question.id],
          undefined,
          question.explanation,
          undefined,
          question.id,
        ));
      } else if (step === "writing") {
        addResponse(lessonContent.writing?.prompt?.text || "Writing response", submission.writingText, undefined, undefined, undefined, "writingText");
      } else if (step === "speaking") {
        const recording = submission.speakingAudioUrl || submission.audioUploads?.speaking;
        addResponse(lessonContent.speaking?.scenario?.text || "Speaking recording", recording ? "Audio response submitted" : "", undefined, undefined, recording ? [recording] : undefined, "speaking");
      }
      return responses;
    }

    blocks.forEach((block) => {
      if (block.type === "text") {
        if (!hasStudentResponse(block)) return;
        const responseType = getStudentResponseType(block);
        const value = responseType === "audio" || responseType === "voice"
          ? submission.audioUploads?.[block.id]
          : responseType === "file"
            ? submission.audioUploads?.[block.id]
            : submission.blockResponses?.[block.id];
        addResponse(block.title || "Text response", responseType === "audio" || responseType === "voice"
          ? value ? "Audio response submitted" : ""
          : responseType === "file" && value ? "File response submitted" : value,
          undefined, undefined, responseType === "audio" || responseType === "voice" ? value ? [value] : undefined : undefined, block.id);
      } else if (block.type === "audio") {
        if (block.allowStudentVoiceResponse) {
          const recording = submission.audioUploads?.[block.id];
          addResponse(block.title || "Audio response", recording ? "Audio response submitted" : "", undefined, undefined, recording ? [recording] : undefined, block.id);
        }
      } else if (block.type === "video") {
        if (block.show_reflection_prompt !== false && block.reflection_prompt_text?.trim()) {
          addResponse(block.reflection_prompt_text, submission.blockResponses?.[`${block.id}-reflection`], undefined, undefined, undefined, `${block.id}-reflection`);
        }
      } else if (block.type === "question") {
        if (block.question_type !== "open_ended" && !block.options.some(Boolean)) return;
        addResponse(
          block.prompt || block.title,
          block.question_type === "open_ended" ? submission.blockResponses?.[block.id] : submission.quizSelections?.[block.id],
          block.question_type === "open_ended" ? undefined : block.correct_answer || lessonContent.results?.answer_keys?.[step]?.[block.id],
          block.explanation,
          undefined,
          block.id,
        );
      } else if (block.type === "quiz") {
        block.questions.filter((question) => question.prompt.trim()).forEach((question) => {
          const answerKey = question.correct_answer
            || question.correctAnswer
            || lessonContent.results?.answer_keys?.[step]?.[question.id]
            || lessonContent.results?.quiz_breakdown?.find((item: { questionId: string; correctResponse: string }) => item.questionId === question.id)?.correctResponse;
          if (question.type === "fill_in_the_blanks") {
            const parsedBlanks = parseFillInBlanks(question.prompt);
            const acceptableAnswers = question.acceptableAnswers?.length
              ? question.acceptableAnswers
              : parsedBlanks.map((blank) => [blank.answer]);
            const plainPrompt = question.prompt.replace(/\[([^\]]+)\]/g, "_____");
            parsedBlanks.forEach((blank, index) => {
              const accepted = acceptableAnswers[index]?.length ? acceptableAnswers[index] : [blank.answer];
              addResponse(
                `${plainPrompt} (Blank ${index + 1})`,
                submission.blockResponses?.[`${question.id}-blank-${index}`],
                accepted.join(" / "),
                question.explanation,
                undefined,
                `${question.id}-blank-${index}`,
                accepted,
                question.caseSensitive,
              );
            });
            return;
          }
          const isShortAnswer = question.type === "short_answer";
          const correctOptionIndex = question.type === "multiple_choice"
            ? (question.options || []).findIndex((option, index) => {
              const key = (answerKey || "").trim();
              return Boolean(key) && (option.trim() === key
                || String.fromCharCode(65 + index).toLowerCase() === key.toLowerCase()
                || String(index + 1) === key);
            })
            : -1;
          const correctOption = correctOptionIndex >= 0 ? question.options?.[correctOptionIndex] : undefined;
          addResponse(
            question.prompt,
            isShortAnswer ? submission.blockResponses?.[question.id] : submission.quizSelections?.[question.id],
            correctOption || answerKey || question.sample_answer,
            question.explanation,
            undefined,
            question.id,
            correctOption ? [correctOption] : undefined,
            false,
            !isShortAnswer,
          );
        });
      } else if (block.type === "fill-in-the-blanks") {
        const blankQuestion = block.textWithBlanks.replace(/\[[^\]]+\]/g, "_____");
        parseFillInBlanks(block.textWithBlanks).forEach((blank, index) => {
          const accepted = block.acceptableAnswers[index]?.length ? block.acceptableAnswers[index] : [blank.answer];
          addResponse(
            `${blankQuestion} (Blank ${index + 1})`,
            submission.blockResponses?.[`${block.id}-blank-${index}`],
            accepted.join(" / "),
            block.explanation,
            undefined,
            `${block.id}-blank-${index}`,
            accepted,
            block.caseSensitive,
          );
        });
      } else if (block.type === "writing") {
        addResponse(block.prompt || block.title || "Writing response", submission.writing_responses?.[block.id] || submission.blockResponses?.[block.id], undefined, block.explanation, undefined, block.id);
      }
    });
    return responses;
  };

  const benchmarkResults = (lessonContent.results || {}) as {
    answer_keys?: Record<string, Record<string, string>>;
    quiz_breakdown?: Array<{ questionId: string; correctResponse: string; skill: string; explanation?: string }>;
    feedback_notes?: Record<string, string>;
    instructor_feedback?: { status?: string; strengths?: string; areasToImprove?: string; nextStep?: string };
    stepLabel?: string;
  };
  const resultSummary = ((lessonContent.results?.blocks || []) as ContentBlock[]).find(
    (block) => block.type === "text" && block.title?.toLowerCase() === "summary"
  );

  const stepResults: StepResult[] = [
    { id: "warm-up", step: "Warm-up", prompt: lessonContent.warm_up?.quote?.text || lessonContent.warm_up?.intro_narrative?.text, responses: getStepResponses("warm_up") },
    { id: "lesson", step: "Lesson", prompt: lessonContent.lesson?.core_concept?.text, responses: getStepResponses("lesson") },
    { id: "listening", step: "Listening", responses: getStepResponses("listening") },
    { id: "reading", step: "Reading", responses: getStepResponses("reading") },
    { id: "writing", step: "Writing", prompt: lessonContent.writing?.prompt?.text, responses: getStepResponses("writing") },
    { id: "speaking", step: "Speaking", prompt: lessonContent.speaking?.scenario?.text, responses: getStepResponses("speaking") },
  ];
  const reportCardStages: UnifiedReportStage[] = stepResults.map((result) => ({
    id: result.id,
    title: result.step,
    prompt: result.prompt,
    tasks: result.responses.map((response, index) => ({
      id: response.id || `${result.id}-${index}`,
      title: response.question,
      studentAnswer: response.answer,
      modelAnswer: response.correctAnswer,
      audioUrls: response.mediaUrls,
      explanation: response.explanation,
    })),
  }));

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
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const submittedAt = new Date().toISOString();
      const finalSubmission = { ...submission, status: "pending_evaluation" as const, submittedAt };
      const completed = STUDY_STEPS.map((step) => step.id);
      const save = persistSubmission(
        finalSubmission,
        { currentStep: "results", completedSteps: [...STUDY_STEPS.map((step) => step.id)], status: "pending_evaluation" },
        true,
        true,
      );
      setIsModalOpen(false);
      setCompletedSteps(completed);
      setCurrentStep("results");
      void save.then((saved) => {
        if (!saved) console.warn("[Lesson Submission] Results are available locally; remote save did not complete.");
      }).catch((error) => {
        console.warn("[Lesson Submission] Results are available locally; remote save failed.", error);
      });
    } catch (error) {
      setSubmissionSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  const isResultsStep = currentStep === "results";
  const areTranscriptsUnlocked = submission.status === "submitted"
    || submission.status === "pending_evaluation"
    || submission.status === "reviewed"
    || submission.status === "evaluated"
    || completedSteps.includes("results")
    || isResultsStep;
  const lessonStudentToken = activeStudent?.token ?? lesson?.student_token ?? lesson?.student_id ?? "student";
  const studentDisplayName = activeStudent?.name || "Student";
  const currentStepSidebarBlocks = ((rawLessonContent.sidebarBlocks as Record<string, { id: string; title: string; body: string; icon?: string; parentMainBlockId?: string }[]> | undefined)?.[currentStep] || []);

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
        <Link href="/dashboard" className="mt-6 inline-flex rounded-md bg-amber-500/20 px-4 py-2 text-xs  text-amber-400">Return to Dashboard</Link>
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
    const renderSidebarBlock = (sidebarBlock: { id: string; title: string; body: string; icon?: string }) => (
      <div className="rounded-xl border border-[#202631] bg-[#121721] p-4">
        {sidebarBlock.title.trim() && sidebarBlock.title.trim() !== "Sidebar note" && <div className="flex items-start gap-2">{sidebarBlock.icon && <DynamicLucideIcon name={sidebarBlock.icon} className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />}<MarkdownContent value={sidebarBlock.title} className="text-xs font-semibold text-amber-400 [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-xs [&_p]:m-0" /></div>}
        <MarkdownContent value={sidebarBlock.body || ""} className="mt-2 text-sm leading-relaxed text-slate-300 [&_strong]:font-semibold [&_strong]:text-amber-400" />
      </div>
    );
    const renderFillInTheBlanks = (block: Extract<ContentBlock, { type: "fill-in-the-blanks" }>) => {
      const values = submission.blockResponses || {};
      return <FillInBlanksMarkdown blockId={block.id} text={block.textWithBlanks} acceptableAnswers={block.acceptableAnswers} wordBank={block.wordBank} caseSensitive={block.caseSensitive} values={values} showFeedback showResults={submission.status === "submitted" || submission.status === "reviewed" || submission.status === "evaluated"} onChange={(blankIndex, value) => void persistSubmission({ ...submission, blockResponses: { ...values, [`${block.id}-blank-${blankIndex}`]: value } })} className="text-sm leading-relaxed text-stone-300" />;
    };
    const visibleBlocks = blocks.filter((block) => block.is_active !== false && block.enabled !== false);
    const questionBlocks = visibleBlocks.filter((block) => block.type === "question");
    const linkedSidebarIds = new Set([
      ...currentStepSidebarBlocks.filter((sidebarBlock) => sidebarBlock.parentMainBlockId).map((sidebarBlock) => sidebarBlock.id),
      ...visibleBlocks
        .filter((block) => block.layoutMode === "inline-row")
        .map((block) => block.sidebarBlockId || block.alignNextTo)
        .filter((id): id is string => Boolean(id)),
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
          || (block.layoutMode === "inline-row" && (block.sidebarBlockId || block.alignNextTo)
            ? currentStepSidebarBlocks.find((candidate) => candidate.id === (block.sidebarBlockId || block.alignNextTo))
            : undefined);
        const rowEmptyMode = block.rowEmptyMode || block.whenEmpty;
        const expandsInlineRow = block.layoutMode === "inline-row" && !sidebarBlock && rowEmptyMode === "full";
        const article = (
        <article key={block.id} className="rounded-xl border border-[#202631] bg-[#121721] p-5">
          {block.title && <h3 className="mb-3 flex items-center gap-2 font-sans text-xl font-semibold text-stone-100">{block.icon && <DynamicLucideIcon name={block.icon} className="h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />}{block.title}</h3>}
          {block.type === "text" && <><MarkdownContent value={block.body} className="text-sm leading-relaxed text-stone-300" />{hasStudentResponse(block) && (() => { const responseType = getStudentResponseType(block); if (responseType === "voice" || responseType === "audio") return <AudioResponseBlock studentId={activeStudent?.id} value={submission.audioUploads?.[block.id]} onChange={(value) => void persistSubmission({ ...submission, audioUploads: { ...(submission.audioUploads || {}), [block.id]: value }, speakingAudioUrl: value })} />; if (responseType === "file") return <FileResponseBlock studentId={activeStudent?.id} value={submission.audioUploads?.[block.id]} onChange={(value) => void persistSubmission({ ...submission, audioUploads: { ...(submission.audioUploads || {}), [block.id]: value } })} />; return <textarea value={submission.blockResponses?.[block.id] || ""} onChange={(event) => void persistSubmission({ ...submission, blockResponses: { ...(submission.blockResponses || {}), [block.id]: event.target.value } })} rows={8} placeholder="Write your response here..." className="mt-4 w-full min-h-[200px] resize-y rounded-lg border border-[#202631] bg-[#0c1017] p-3 text-sm text-stone-200 outline-none focus:border-amber-500/40" aria-label={`${block.title || "Text"} response`} />; })()}</>}
          {block.type === "audio" && <>{block.audioUrl && <CustomAudioPlayer src={block.audioUrl} label={block.title || "Audio assignment"} />}{block.allowStudentVoiceResponse === true && <AudioResponseBlock studentId={activeStudent?.id} value={submission.audioUploads?.[block.id]} onChange={(value) => void persistSubmission({ ...submission, audioUploads: { ...(submission.audioUploads || {}), [block.id]: value }, speakingAudioUrl: value })} />}<MediaTranscriptAccordion transcript={block.transcript} isUnlocked={areTranscriptsUnlocked} /></>}
          {block.type === "video" && <><InteractiveVideoBlock videoUrl={block.videoUrl} title={block.title || "Lesson video"} transcript={block.transcript} transcriptLocked={!areTranscriptsUnlocked} />{!areTranscriptsUnlocked && <MediaTranscriptAccordion transcript={block.transcript} isUnlocked={false} />}{block.show_reflection_prompt !== false && block.reflection_prompt_text?.trim() && <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/20 p-4"><p className="text-sm font-semibold text-amber-400">Reflection Question</p><p className="mt-2 text-sm leading-relaxed text-stone-300">{block.reflection_prompt_text.trim()}</p><textarea value={submission.blockResponses?.[`${block.id}-reflection`] || ""} onChange={(event) => void persistSubmission({ ...submission, blockResponses: { ...(submission.blockResponses || {}), [`${block.id}-reflection`]: event.target.value } })} rows={5} placeholder="Write your reflection here..." className="mt-3 w-full resize-y rounded-lg border border-[#202631] bg-[#0c1017] p-3 text-sm text-stone-200 outline-none focus:border-amber-500/40" aria-label="Reflection question response" /></div>}</>}
          {block.type === "fill-in-the-blanks" && renderFillInTheBlanks(block)}
          {block.type === "writing" && <WritingBlockRenderer block={block} value={submission.writing_responses?.[block.id] || ""} onChange={(value) => void persistSubmission({ ...submission, writingText: value, writing_responses: { ...(submission.writing_responses || {}), [block.id]: value } })} />}
          {block.type === "image" && block.imageUrl && <figure><img src={block.imageUrl} alt={block.caption || block.title || "Lesson image"} className="max-h-[420px] w-full rounded-lg object-cover" onError={(e)=>{ (e.target as HTMLImageElement).style.display="none"; (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden"); }} /><div className="hidden rounded border border-dashed border-[#394252] p-4 text-xs text-stone-500">Image unavailable — {block.caption || block.title || "Lesson image"}</div>{block.caption && <figcaption className="mt-2 text-xs text-stone-500">{block.caption}</figcaption>}</figure>}
          {block.type === "resource" && block.resourceUrl && <a href={block.resourceUrl} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-lg border border-amber-500/40 bg-amber-500/20 p-4 text-sm text-amber-400 hover:border-amber-500/40">{block.description || "Open document"}<span aria-hidden="true">PDF</span></a>}
          {block.type === "question" && <ExerciseQuestions
            questions={questionBlocks.map((questionBlock) => ({
              id: questionBlock.id,
              type: questionBlock.question_type === "open_ended" ? "short_answer" : "multiple_choice",
              prompt: questionBlock.prompt,
              options: questionBlock.options,
              optionIndexingStyle: questionBlock.optionIndexingStyle,
              correct_answer: questionBlock.correct_answer,
              sample_answer: questionBlock.sample_answer,
              explanation: questionBlock.explanation,
            }))}
            choiceAnswers={submission.quizSelections}
            textAnswers={submission.blockResponses}
            onChoiceAnswer={(questionId, answer) => void persistSubmission({ ...submission, quizSelections: { ...(submission.quizSelections || {}), [questionId]: answer } })}
            onTextAnswer={(questionId, answer) => void persistSubmission({ ...submission, blockResponses: { ...(submission.blockResponses || {}), [questionId]: answer } })}
          />}
          {block.type === "quiz" && <ExerciseQuestions
            questions={block.questions}
            choiceAnswers={submission.quizSelections}
            textAnswers={submission.blockResponses}
            onChoiceAnswer={(questionId, answer) => void persistSubmission({ ...submission, quizSelections: { ...(submission.quizSelections || {}), [questionId]: answer } })}
            onTextAnswer={(questionId, answer) => void persistSubmission({ ...submission, blockResponses: { ...(submission.blockResponses || {}), [questionId]: answer } })}
            onBlankAnswer={(questionId, blankIndex, answer) => void persistSubmission({ ...submission, blockResponses: { ...(submission.blockResponses || {}), [`${questionId}-blank-${blankIndex}`]: answer } })}
          />}
        </article>
        );
        const sidebarContent = (
          <div className="lg:col-span-1 h-full w-full space-y-4">
            {blockIndex === 0 && topSidebarBlocks.map((topSidebarBlock) => <div key={topSidebarBlock.id}>{renderSidebarBlock(topSidebarBlock)}</div>)}
            {(block.type === "question" ? questionSidebarBlocks : sidebarBlock ? [sidebarBlock] : []).map((sidebarItem) => <div key={sidebarItem.id}>{renderSidebarBlock(sidebarItem)}</div>)}
          </div>
        );
        return (
          <StudyRoomBlockRow key={block.id} fullWidth={expandsInlineRow} sidebar={sidebarContent}>{article}</StudyRoomBlockRow>
        );
      })}
      {visibleBlocks.length === 0 && <p className="rounded-xl border border-dashed border-[#394252] p-6 text-sm text-stone-500">This step has no content blocks yet.</p>}
    </div>
    );
  };

  return (
    <div className="fluentia-study-room min-h-screen bg-[#0c1017] text-[#e8e7e4]">
      <div className="mx-auto max-w-7xl px-4 pt-6 md:px-6">
      {submissionSaveError && (
        <p role="alert" className="mb-4 rounded-md border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-200">
          Your submission could not be saved: {submissionSaveError}
        </p>
      )}
      {!isResultsStep && (
        <section className="relative flex h-[280px] w-full items-start overflow-hidden rounded-2xl bg-slate-950 md:h-[320px]">
          {heroBanner ? (
            <img src={heroBanner} alt="" onError={() => setBannerLoadFailed(true)} style={getBannerPositionStyles(bannerPosition)} className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0 bg-slate-950" aria-hidden="true" />
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-950/60 to-transparent" aria-hidden="true" />
          <div className="relative z-10 flex w-full flex-col items-start gap-2 px-4 py-4 text-left md:px-6">
            <span className="rounded-md border border-amber-500/40 bg-amber-500/20 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-400 md:text-sm">{lessonLevel} - MODULE {lessonModuleNumber ?? 1}</span>
            <h1 className="font-sans text-3xl font-bold tracking-tight text-[#f1eee8] md:text-4xl lg:text-[36px]">
              {displayLessonTitle || lesson.title}
            </h1>
            {lessonSubtitle && <p className="text-sm text-[#b5bac2] opacity-90 md:text-base">{lessonSubtitle}</p>}
            <div className="mt-1 flex items-center gap-2 text-xs text-[#9ba1aa] md:text-sm"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#283344] text-[10px] font-semibold text-amber-400">{instructor.initials}</span>Guided by {instructor.fullName}</div>
            <div className="mt-1 flex h-9 w-9 items-center justify-center rounded-full border-2 border-amber-500/40 bg-transparent p-1.5 md:h-10 md:w-10"><img src="/logo.png" alt="Fluentia" className="h-full w-full object-contain" /></div>
          </div>
        </section>
      )}

            <div className="py-8">
            <header>
        <div className="flex flex-wrap items-center justify-between gap-3 text-[12px]">
          <p className="text-[#aeb2b9]">Welcome back, <span className="text-[#e6e4e0]">{studentDisplayName}</span>.</p>
          <div className="flex flex-wrap items-center gap-2">
            <AmbientMusicPlayer src={lessonContent.ambientMusicUrl} studentScope={activeStudent?.id || activeStudent?.token || lesson?.student_id || lesson?.student_token || "student"} />
            <StudyRoomTimer />
            {((typeof lesson.instructor_note === "string" && lesson.instructor_note.trim()) || (typeof rawLessonContent.instructorGuidance === "string" && rawLessonContent.instructorGuidance.trim())) && <Tooltip content="Open lesson guidance"><button type="button" onClick={() => setGuidanceOpen((open) => !open)} aria-expanded={guidanceOpen} aria-label="Open lesson guidance" className={`flex h-8 w-8 items-center justify-center rounded-md border bg-transparent transition-colors duration-200 hover:border-amber-500/50 hover:bg-amber-500/10 hover:text-amber-400 ${guidanceOpen ? "border-amber-500/40 text-amber-400" : "border-slate-700/50 text-slate-400"}`}><Lightbulb className="h-4 w-4" /></button></Tooltip>}
            <Tooltip content="Open your notes, resources, and study tools"><button type="button" onClick={() => setSidebarOpen((open) => !open)} aria-expanded={sidebarOpen} aria-controls="learning-sidebar" className={`flex h-8 items-center gap-1.5 rounded-md border bg-transparent px-3 text-xs transition-colors duration-200 hover:border-amber-500/50 hover:bg-amber-500/10 hover:text-amber-400 ${sidebarOpen ? "border-amber-500/40 text-amber-400" : "border-slate-700/50 text-slate-400"}`}><PanelRight className="h-3.5 w-3.5" />Learning Hub</button></Tooltip>
            <Tooltip content="Look up a word"><button type="button" onClick={() => setDictionaryWord("")} aria-label="Open dictionary" className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-700/50 bg-transparent text-slate-400 transition-colors duration-200 hover:border-amber-500/50 hover:bg-amber-500/10 hover:text-amber-400"><BookOpen className="w-4 h-4" /></button></Tooltip>
            <Tooltip content="Display and appearance"><DisplaySettingsControl /></Tooltip>
            <Tooltip content="Return to your course overview"><Link href="/dashboard" className="flex h-8 items-center gap-1 rounded-md border border-slate-700/50 bg-transparent px-3 text-xs text-slate-400 transition-colors duration-200 hover:border-amber-500/50 hover:bg-amber-500/10 hover:text-amber-400"><ChevronRight className="h-3 w-3 rotate-180" />Course overview</Link></Tooltip>
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
              {(lessonContent.warm_up?.intro_narrative?.text || lessonContent.warm_up?.quote?.text || lessonContent.warm_up?.quick_prompts?.length) && <div id="lesson-content" className="flex items-center gap-2 text-amber-400">
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
                className="mt-2 w-full min-h-[200px] resize-y rounded-[10px] border border-[#29303c] bg-[#171d28] px-5 py-5 text-[15px] leading-relaxed text-[#d9dce0] placeholder-[#7b8290] shadow-[0_8px_24px_rgba(0,0,0,.12)] transition-colors placeholder:text-[13px] focus:border-amber-500/40 focus:outline-none focus:ring-1 focus:ring-amber-500/40"
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
              {lessonContent.listening?.transcript?.text && <MediaTranscriptAccordion transcript={lessonContent.listening.transcript.text} isUnlocked={areTranscriptsUnlocked} />}
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
                          className={`rounded-md border px-3 py-2 text-left text-xs transition ${submission.listeningAnswers[question.id] === option ? "border-amber-500/40 bg-amber-500/20 text-amber-400" : "border-[#202631] bg-[#0c1017] text-stone-400 hover:border-amber-500/40"}`}
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
                  <span key={item.word} className="rounded-md border border-amber-500/40 bg-amber-500/20 px-2 py-1 text-xs text-amber-400">
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
              <div className="w-16 h-16 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center mx-auto">
                <Award className="w-8 h-8 text-amber-400" />
              </div>
              <div className="space-y-2 text-center">
                <h3 className="text-2xl font-sans font-semibold text-stone-100">
                  Lesson Submitted &amp; Completed!
                </h3>
                {lessonContent.results?.self_reflection?.text && <p className="text-stone-400 text-sm">{lessonContent.results.self_reflection.text}</p>}
              </div>
              <div className="grid gap-4 text-left md:grid-cols-2">
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
              <UnifiedReportCard
                stages={reportCardStages}
                isInstructorView={false}
                isEvaluated={isEvaluationPublished || submission.status === "reviewed" || submission.status === "evaluated"}
                scores={evaluation?.scores || {}}
                criterionFeedback={evaluation?.criterionFeedback || {}}
                stageFeedback={evaluation?.stageFeedback || {}}
                comments={evaluation?.comments || ""}
                strengths={evaluation?.strengths}
                areasToImprove={evaluation?.areasToImprove}
                studyHubPrescription={evaluation?.studyHubPrescription}
              />

              {(lessonContent.warm_up?.lexicon_notes?.text || lessonContent.lesson || lessonContent.reading || lessonContent.writing || lessonContent.speaking) && <div className="rounded-xl border border-[#202631] bg-[#121721] p-5 text-left">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">Recommended review</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setSidebarOpen(true)} className="rounded-md border border-amber-500/40 bg-amber-500/20 px-2.5 py-1.5 text-xs text-amber-400 hover:bg-amber-500/20">Review lexicon notes</button>
                  <button type="button" onClick={() => setCurrentStep("warm_up")} className="rounded-md border border-[#394252] bg-[#171d28] px-2.5 py-1.5 text-xs text-stone-300 hover:border-amber-500/40">Revisit lesson content</button>
                </div>
              </div>}

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
            <Tooltip content="Return to the previous lesson step"><button
              onClick={handlePrev}
              disabled={currentIndex === 0}
              className="px-0 py-2 text-[11px] text-[#566078] transition-colors hover:text-[#b3b8c1] disabled:cursor-not-allowed disabled:opacity-30"
            >
              Previous
            </button></Tooltip>
            <Tooltip content={currentIndex === STUDY_STEPS.length - 2 ? "Finish the lesson and view your results" : "Continue to the next lesson step"}><button
              onClick={handleNext}
              className="flex items-center gap-2 rounded-lg bg-amber-500/20 px-6 py-2.5 text-[12px]  text-amber-400 shadow-md transition-all hover:bg-amber-500/20"
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
            </button></Tooltip>
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
        isSubmitting={isSubmitting}
        submitError={submissionSaveError}
      />
      <LearningSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        words={savedWords}
        notes={notes}
        studentId={activeStudent?.id}
        studentToken={activeStudent?.token || lesson?.student_token || lesson?.student_id || undefined}
        activeLessonId={lesson?.id}
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
        <aside className={`absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-amber-500/40 bg-[#0c1017]/95 p-5 text-stone-200 shadow-2xl backdrop-blur-md transition-transform duration-300 ease-in-out ${guidanceOpen ? "translate-x-0" : "translate-x-full"}`} role="dialog" aria-modal={guidanceOpen} aria-labelledby="lesson-guidance-title" onClick={(event) => event.stopPropagation()}>
          <div className="flex items-center justify-between border-b border-[#293343] pb-4"><h2 id="lesson-guidance-title" className="flex items-center gap-2 text-sm font-semibold text-amber-400"><Lightbulb className="h-4 w-4" />Lesson Guidance</h2><button type="button" onClick={() => setGuidanceOpen(false)} aria-label="Close lesson guidance" className="rounded-md p-2 text-stone-400 transition hover:bg-white/10 hover:text-stone-100"><X className="h-4 w-4" /></button></div>
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
