"use client";

import React, { useEffect, useRef, useState } from "react";
import { ContentBlock, ContentBlockType, ExerciseQuestionType, OptionIndexingStyle, QuizQuestion, STUDY_STEPS, StudyStepId, StrictStepContent } from "@/types/lesson";
import { useLessonEditorStore } from "@/lib/lesson-editor-store";
import { CustomAudioPlayer } from "@/components/study-room/custom-audio-player";
import { InteractiveVideoBlock } from "@/components/shared/interactive-video-block";
import { MarkdownContent } from "@/components/study-room/markdown-content";
import { FillInBlanksMarkdown } from "@/components/study-room/fill-in-blanks-markdown";
import { WritingBlockEditor } from "@/components/shared/writing-block";
import { getQuizQuestionPrompt, parseFillInBlanks } from "@/lib/fill-in-blanks";
import { uploadLessonAsset, uploadLessonMedia } from "@/services/storage-service";
import { DynamicLucideIcon, LucideIconPicker } from "@/components/shared/lucide-icon-picker";
import { TiptapEditor } from "@/components/shared/tiptap-editor";
import { parseInteractiveTranscript } from "@/lib/transcripts";
import { Eye, FileText, Layers, LoaderCircle, MoveDown, MoveUp, Plus, Trash2, UploadCloud, X, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Mic, Square } from "lucide-react";

interface LessonTailorEditorProps {
  content: StrictStepContent;
  onChange?: (updatedContent: StrictStepContent) => void;
  onPreview?: () => void;
  onActiveStepChange?: (step: Exclude<StudyStepId, "results">) => void;
  sidebarBlocksByStep?: Partial<Record<StudyStepId, { id: string; title: string; body: string }[]>>;
}

function QuestionSettings({ value, onChange }: { value?: OptionIndexingStyle; onChange: (value: OptionIndexingStyle) => void }) {
  return (
    <label className="block text-xs text-stone-500">
      Option Indexing Style
      <select value={value || "none"} onChange={(event) => onChange(event.target.value as OptionIndexingStyle)} className="mt-1 w-full rounded border border-[#202631] bg-[#0c1017] p-2 text-xs text-stone-200 [color-scheme:dark]" aria-label="Option Indexing Style">
        <option value="alphabetical">Alphabetical (A, B, C, D)</option>
        <option value="numeric">Numeric (1, 2, 3, 4)</option>
        <option value="none">None (Plain Buttons)</option>
      </select>
    </label>
  );
}

type MediaBlockType = "image" | "audio" | "video" | "resource";

const mediaRules: Record<MediaBlockType, { accept: string; label: string; description: string }> = {
  image: { accept: "image/*", label: "an image", description: "PNG, JPG, GIF, or WebP" },
  audio: { accept: "audio/*", label: "an audio file", description: "MP3, WAV, OGG, or M4A" },
  video: { accept: "video/*", label: "a video", description: "MP4, WebM, or MOV" },
  resource: { accept: ".pdf,application/pdf", label: "a PDF", description: "PDF documents only" },
};

function MediaAssetInput({
  kind,
  value,
  onChange,
  disabled = false,
}: {
  kind: MediaBlockType;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [mode, setMode] = useState<"upload" | "url">(value ? "url" : "upload");
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rules = mediaRules[kind];
  const inputId = `media-upload-${kind}`;

  const handleFile = async (file?: File) => {
    if (!file || disabled || isUploading) return;
    setError(null);
    if (file.size > 15 * 1024 * 1024) {
      setError("Files must be 15 MB or smaller.");
      return;
    }
    const isPdf = kind === "resource" && (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
    if (kind === "resource" ? !isPdf : !file.type.startsWith(`${kind}/`)) {
      setError(`Please choose ${rules.label} with a supported file type.`);
      return;
    }
    setIsUploading(true);
    try {
      const asset = await uploadLessonAsset(file, kind);
      onChange(asset.url);
      setMode("upload");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed. Check the Storage bucket and try again.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-2 rounded border border-[#202631] bg-[#0c1017]/60 p-3">
      <div className="flex rounded border border-[#394252] p-0.5" role="tablist" aria-label={`${kind} source`}>
        <button type="button" role="tab" aria-selected={mode === "upload"} onClick={() => setMode("upload")} className={`flex-1 px-2 py-1.5 text-[11px]  ${mode === "upload" ? "bg-amber-500/20 text-amber-400" : "text-stone-400 hover:text-stone-200"}`}>Upload File</button>
        <button type="button" role="tab" aria-selected={mode === "url"} onClick={() => setMode("url")} className={`flex-1 px-2 py-1.5 text-[11px]  ${mode === "url" ? "bg-amber-500/20 text-amber-400" : "text-stone-400 hover:text-stone-200"}`}>External URL</button>
      </div>
      {mode === "url" ? (
        <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={`Paste ${kind} URL`} disabled={disabled} className="w-full rounded border border-[#202631] bg-[#0c1017] p-2 text-xs text-stone-200 outline-none focus:border-amber-500/40 disabled:opacity-50" aria-label={`${kind} external URL`} />
      ) : (
        <>
          <label htmlFor={inputId} onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={(event) => { event.preventDefault(); setIsDragging(false); void handleFile(event.dataTransfer.files[0]); }} className={`flex cursor-pointer flex-col items-center justify-center rounded border border-dashed p-4 text-center transition ${isDragging ? "border-amber-500/40 bg-amber-500/20" : "border-[#394252] hover:border-amber-500/40"} ${disabled || isUploading ? "cursor-not-allowed opacity-60" : ""}`}>
            {isUploading ? <LoaderCircle className="mb-2 h-5 w-5 animate-spin text-amber-400" /> : <UploadCloud className="mb-2 h-5 w-5 text-amber-400" />}
            <span className="text-xs font-semibold text-stone-200">{isUploading ? "Uploading..." : `Drop ${rules.label} here or browse`}</span>
            <span className="mt-1 text-[10px] text-stone-500">{rules.description} · Max 15 MB</span>
            <input id={inputId} type="file" accept={rules.accept} className="sr-only" disabled={disabled || isUploading} onChange={(event) => void handleFile(event.target.files?.[0])} />
          </label>
          {value && <div className="flex items-center gap-3 rounded border border-emerald-500/30 bg-emerald-500/5 p-2">
            {kind === "image" ? <img src={value} alt="Uploaded media preview" className="h-14 w-20 rounded object-cover" /> : kind === "audio" ? <audio controls src={value} className="h-8 min-w-0 flex-1" /> : kind === "video" ? <video controls src={value} className="h-14 w-24 rounded object-cover" /> : <FileText className="h-8 w-8 shrink-0 text-amber-400" />}
            <span className="min-w-0 flex-1 truncate text-[11px] text-emerald-200">File uploaded</span>
            <button type="button" onClick={() => onChange("")} disabled={disabled || isUploading} className="shrink-0 text-[11px]  text-stone-400 underline hover:text-red-300 disabled:opacity-50">Remove / Replace</button>
          </div>}
        </>
      )}
      {error && <p className="text-[11px] text-red-300" role="alert">{error}</p>}
    </div>
  );
}

export function LessonTailorEditor({
  content,
  onChange,
  onPreview,
  onActiveStepChange,
  sidebarBlocksByStep = {},
}: LessonTailorEditorProps) {
  const [activeStep, setActiveStep] = useState<StudyStepId>("warm_up");
  const [isBuilderSidebarOpen, setIsBuilderSidebarOpen] = useState(true);
  const pendingBlockScrollRef = useRef<string | null>(null);
  const [draftContent, setDraftContent] = useState(content);
  const draftContentRef = useRef(content);
  const lastEmittedContentRef = useRef(JSON.stringify(content));
  const localUpdatePendingRef = useRef(false);
  const [openTranscript, setOpenTranscript] = useState<Record<string, boolean>>({});
  const [openReflectionSettings, setOpenReflectionSettings] = useState<Record<string, boolean>>({});
  const [expandedBlocks, setExpandedBlocks] = useState<Record<string, boolean>>({});
  const [fillBlankModes, setFillBlankModes] = useState<Record<string, "edit" | "preview">>({});
  const [fillBlankPreviewValues, setFillBlankPreviewValues] = useState<Record<string, string>>({});
  const [recordingByBlockId, setRecordingByBlockId] = useState<Record<string, { status: "recording" | "uploading" | "error"; error?: string; elapsed?: number; levels?: number[] }>>({});
  const recorderRef = useRef<Map<string, MediaRecorder>>(new Map());
  const streamRef = useRef<Map<string, MediaStream>>(new Map());
  const chunksRef = useRef<Map<string, BlobPart[]>>(new Map());
  const discardOnStopRef = useRef<Set<string>>(new Set());
  const timerById = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const ctxById = useRef<Map<string, AudioContext>>(new Map());
  const animById = useRef<Map<string, number>>(new Map());
  const startAtById = useRef<Map<string, number>>(new Map());
  
  // Zustand store integration
  const {
    addBlock,
    updateBlock,
    deleteBlock,
    reorderBlocks,
  } = useLessonEditorStore();

  useEffect(() => {
    const serializedContent = JSON.stringify(content);
    if (localUpdatePendingRef.current) {
      if (serializedContent === lastEmittedContentRef.current) localUpdatePendingRef.current = false;
      return;
    }
    if (serializedContent !== lastEmittedContentRef.current) {
      draftContentRef.current = content;
      setDraftContent(content);
      lastEmittedContentRef.current = serializedContent;
      setExpandedBlocks({});
      setOpenTranscript({});
      setOpenReflectionSettings({});
    }
  }, [content]);

  // Wrapper to handle both local state and Supabase sync
  const handleChange = (updatedContent: StrictStepContent) => {
    localUpdatePendingRef.current = true;
    draftContentRef.current = updatedContent;
    lastEmittedContentRef.current = JSON.stringify(updatedContent);
    setDraftContent(updatedContent);
    if (onChange) {
      onChange(updatedContent);
    }
  };

  const updateStepValue = (step: StudyStepId, field: string, value: unknown) => {
    handleChange({
      ...draftContentRef.current,
      [step]: {
        ...(draftContentRef.current[step] || {}),
        [field]: value,
      },
    });
  };

  const updateArrayValue = (
    step: StudyStepId,
    field: string,
    index: number,
    key: string,
    value: unknown
  ) => {
    const stepContent = (content[step] || {}) as Record<string, any>;
    const items = [...((stepContent[field] as any[]) || [])];
    items[index] = { ...items[index], [key]: value };
    updateStepValue(step, field, items);
  };

  const getBlocks = (step: StudyStepId): ContentBlock[] =>
    (((draftContentRef.current[step] || {}) as { blocks?: ContentBlock[] }).blocks || []);
  const allLessonBlocks = STUDY_STEPS
    .filter((step) => step.id !== "results")
    .flatMap((step) => getBlocks(step.id));
  const activeBlockCount = allLessonBlocks.filter((block) => block.is_active !== false && block.enabled !== false).length;

  const navigateToStep = (step: StudyStepId) => {
    setActiveStep(step);
    if (step !== "results") onActiveStepChange?.(step);
  };

  useEffect(() => {
    const blockId = pendingBlockScrollRef.current;
    if (!blockId) return;
    pendingBlockScrollRef.current = null;
    window.requestAnimationFrame(() => {
      document.getElementById(`lesson-builder-block-${blockId}`)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, [activeStep]);

  const scrollToBlock = (blockId: string) => {
    document.getElementById(`lesson-builder-block-${blockId}`)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const updateBlocks = (step: StudyStepId, blocks: ContentBlock[]) => updateStepValue(step, "blocks", blocks);

  const createBlock = (type: ContentBlockType): ContentBlock => {
    const id = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const base = { id, type, enabled: true, is_active: true };
    if (type === "text") return { ...base, type: "text", title: "Text block", body: "", hasStudentResponseInput: false, studentResponseType: "text", studentResponseConfig: { enabled: false, allowedTypes: ["text"] } };
    if (type === "audio") return { ...base, type: "audio", title: "Audio lesson", audioUrl: "", transcript: "", allowStudentVoiceResponse: false };
    if (type === "video") return { ...base, type: "video", title: "Video lesson", videoUrl: "", transcript: "", show_reflection_prompt: true, reflection_prompt_text: "" };
    if (type === "image") return { ...base, type: "image", title: "Image", imageUrl: "", caption: "" };
    if (type === "resource") return { ...base, type: "resource", title: "Document", resourceUrl: "", description: "" };
    if (type === "question") return { ...base, type: "question", title: "Question", prompt: "", options: ["", "", ""], correct_answer: "", question_type: "multiple_choice", optionIndexingStyle: "none", sample_answer: "" };
    if (type === "fill-in-the-blanks") return { ...base, type: "fill-in-the-blanks", title: "Fill in the Blanks", textWithBlanks: "", acceptableAnswers: [], wordBank: [], caseSensitive: false };
    if (type === "writing") return { ...base, type: "writing", title: "Writing prompt", prompt: "", minWordCount: 150, maxWordCount: 250, guidance: "" };
    return { ...base, type: "quiz", block_id: id, block_type: "quiz", title: "Quiz / Exercise", questions: [{ id: `${id}-q1`, type: "multiple_choice", prompt: "", options: ["", "", ""], correct_answer: "" }] };
  };

  const updateDynamicBlock = (step: StudyStepId, index: number, patch: Partial<ContentBlock>) => {
    const blocks = getBlocks(step).map((block, blockIndex) => blockIndex === index ? { ...block, ...patch } as ContentBlock : block);
    updateBlocks(step, blocks);
    
    // Sync to Supabase after the local draft has rendered the change.
    const block = blocks[index];
    if (block) {
      updateBlock(step, block.id, patch).catch((error: any) => {
        console.error("Failed to update block:", error);
      });
    }
  };

  const fmt = (s:number)=> `${String(Math.floor(s/60)).padStart(2,"0")}:${String(Math.floor(s%60)).padStart(2,"0")}`;
  const stopTracks = (stream?: MediaStream | null) => {
    if (!stream) return;
    stream.getTracks().forEach((track) => track.stop());
  };
  const cleanupRecordingVisual = (blockId:string)=>{
    const a=animById.current.get(blockId); if(a) cancelAnimationFrame(a); animById.current.delete(blockId);
    const t=timerById.current.get(blockId); if(t) clearInterval(t); timerById.current.delete(blockId);
    const c=ctxById.current.get(blockId); if(c) try{c.close();}catch{} ctxById.current.delete(blockId);
    startAtById.current.delete(blockId);
  };

  const pickRecordingMimeType = () => {
    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
    for (const candidate of candidates) {
      try {
        if (typeof MediaRecorder !== "undefined" && (MediaRecorder as any).isTypeSupported?.(candidate)) return candidate;
      } catch {
        // ignore probing errors
      }
    }
    return "";
  };

  const setRecordingState = (blockId: string, next: { status: "recording" | "uploading" | "error"; error?: string; elapsed?: number; levels?: number[] } | null) => {
    setRecordingByBlockId((current) => {
      if (!next) {
        if (!current[blockId]) return current;
        const { [blockId]: _omit, ...rest } = current;
        return rest;
      }
      return { ...current, [blockId]: next };
    });
  };

  const finalizeRecordingUpload = async (blockId: string, step: StudyStepId, index: number) => {
    const chunks = chunksRef.current.get(blockId) || [];
    const recorder = recorderRef.current.get(blockId);
    const stream = streamRef.current.get(blockId) || null;
    const shouldDiscard = discardOnStopRef.current.has(blockId);
    chunksRef.current.delete(blockId);
    recorderRef.current.delete(blockId);
    streamRef.current.delete(blockId);
    discardOnStopRef.current.delete(blockId);
    cleanupRecordingVisual(blockId);
    stopTracks(stream);
    if (shouldDiscard) {
      setRecordingState(blockId, null);
      return;
    }
    if (!chunks.length) {
      setRecordingState(blockId, { status: "error", error: "No audio captured. Try again." });
      return;
    }
    const mimeType = recorder?.mimeType || pickRecordingMimeType() || "audio/webm";
    const blob = new Blob(chunks as BlobPart[], { type: mimeType });
    const extension = mimeType.includes("mp4") ? "mp4" : mimeType.includes("ogg") ? "ogg" : "webm";
    const file = new File([blob], `voice-${Date.now()}.${extension}`, { type: mimeType });
    setRecordingState(blockId, { status: "uploading" });
    try {
      const asset = await uploadLessonMedia(file, `lesson-${step}-${Date.now()}`);
      updateDynamicBlock(step, index, { audioUrl: asset.url });
      setRecordingState(blockId, null);
    } catch (error) {
      console.error("Lesson voice recording upload failed:", error);
      setRecordingState(blockId, { status: "error", error: "Upload failed. Check connection and try again." });
    }
  };

  const startRecording = async (blockId: string, step: StudyStepId, index: number) => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setRecordingState(blockId, { status: "error", error: "Recording is not supported in this browser." });
      return;
    }
    if (recorderRef.current.get(blockId)?.state === "recording") return;
    setRecordingState(blockId, { status: "recording", elapsed: 0, levels: Array(18).fill(5) });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickRecordingMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? ({ mimeType } as MediaRecorderOptions) : undefined);
      chunksRef.current.set(blockId, []);
      streamRef.current.set(blockId, stream);
      recorderRef.current.set(blockId, recorder);
      startAtById.current.set(blockId, Date.now());
      timerById.current.set(blockId, setInterval(()=> {
        const s=Math.floor((Date.now()-(startAtById.current.get(blockId)||Date.now()))/1000);
        setRecordingByBlockId(c=> c[blockId]?.status==="recording"?{...c,[blockId]:{...c[blockId],elapsed:s}}:c);
      },200));
      try{
        const Ctx=(window.AudioContext||(window as unknown as {webkitAudioContext:typeof AudioContext}).webkitAudioContext);
        const ctx=new Ctx(); ctxById.current.set(blockId,ctx);
        const src=ctx.createMediaStreamSource(stream); const an=ctx.createAnalyser(); an.fftSize=64; src.connect(an);
        const arr=new Uint8Array(an.frequencyBinCount);
        const tick=()=>{ an.getByteFrequencyData(arr); const bars=Array.from({length:18},(_,i)=>Math.max(4,Math.min(26,4+(arr[Math.floor(i/18*arr.length)]||0)*0.09))); setRecordingByBlockId(c=> c[blockId]?.status==="recording"?{...c,[blockId]:{...c[blockId],levels:bars}}:c); const id=requestAnimationFrame(tick); animById.current.set(blockId,id); };
        tick();
      }catch{}
      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) chunksRef.current.get(blockId)?.push(event.data);
      };
      recorder.onstop = () => {
        void finalizeRecordingUpload(blockId, step, index);
      };
      recorder.onerror = () => {
        cleanupRecordingVisual(blockId); stopTracks(stream);
        chunksRef.current.delete(blockId);
        recorderRef.current.delete(blockId);
        streamRef.current.delete(blockId);
        setRecordingState(blockId, { status: "error", error: "Recording failed. Try again." });
      };
      recorder.start(200);
    } catch (error) {
      cleanupRecordingVisual(blockId);
      const message = error instanceof DOMException && error.name === "NotAllowedError"
        ? "Microphone permission denied."
        : error instanceof DOMException && error.name === "NotFoundError"
          ? "No microphone found."
          : "Unable to start recording.";
      setRecordingState(blockId, { status: "error", error: message });
    }
  };

  const stopRecording = (blockId: string) => {
    const recorder = recorderRef.current.get(blockId);
    if (!recorder || recorder.state !== "recording") return;
    try {
      recorder.stop();
    } catch {
      stopTracks(streamRef.current.get(blockId) || null);
      chunksRef.current.delete(blockId);
      recorderRef.current.delete(blockId);
      streamRef.current.delete(blockId);
      setRecordingState(blockId, { status: "error", error: "Unable to stop recording." });
    }
  };

  const cancelRecording = (blockId: string) => {
    const recorder = recorderRef.current.get(blockId);
    if (!recorder || recorder.state !== "recording") {
      stopTracks(streamRef.current.get(blockId) || null);
      chunksRef.current.delete(blockId);
      recorderRef.current.delete(blockId);
      streamRef.current.delete(blockId);
      discardOnStopRef.current.delete(blockId);
      setRecordingState(blockId, null);
      return;
    }
    discardOnStopRef.current.add(blockId);
    try {
      recorder.stop();
    } catch {
      stopTracks(streamRef.current.get(blockId) || null);
      chunksRef.current.delete(blockId);
      recorderRef.current.delete(blockId);
      streamRef.current.delete(blockId);
      discardOnStopRef.current.delete(blockId);
      setRecordingState(blockId, null);
    }
  };

  useEffect(() => {
    return () => {
      recorderRef.current.forEach((recorder, blockId) => {
        if (discardOnStopRef.current.has(blockId)) return;
        try {
          if (recorder.state === "recording") recorder.stop();
        } catch {
          // ignore teardown errors
        }
      });
      streamRef.current.forEach((stream) => stopTracks(stream));
      timerById.current.forEach(clearInterval); ctxById.current.forEach(c=>{try{c.close();}catch{}}); animById.current.forEach(cancelAnimationFrame);
    };
  }, []);

  const renderTranscriptField = (step: StudyStepId, index: number, block: ContentBlock & { transcript?: string }) => {
    const isOpen = openTranscript[block.id] ?? false;
    const transcriptLines = parseInteractiveTranscript(block.transcript || "");
    const preview = (block.transcript || "").trim();
    return (
      <div className="overflow-hidden rounded border border-[#202631] bg-[#0c1017]/50">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setOpenTranscript((current) => ({ ...current, [block.id]: !(current[block.id] ?? false) }));
          }}
          aria-expanded={isOpen}
          aria-controls={`transcript-${block.id}`}
          className="flex w-full items-center justify-between px-2 py-1.5 text-left text-xs text-stone-400 hover:text-amber-400"
        >
          <span className="text-[11px]  uppercase tracking-[0.08em]">{block.type === "video" ? "Video Transcript" : "Audio Transcript"}{preview ? ` · ${transcriptLines.length || preview.length} items` : " (optional)"}</span>
          {isOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-amber-400" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-amber-400" />}
        </button>
        {isOpen && (
          <div id={`transcript-${block.id}`} className="border-t border-[#202631] p-2">
            <textarea
              value={block.transcript || ""}
              onChange={(event) => updateDynamicBlock(step, index, { transcript: event.target.value })}
              placeholder="Paste transcript or VTT/SRT content here. Timestamp examples: 00:00:12 Welcome..."
              rows={8}
              className="max-h-80 min-h-[140px] w-full resize-y overflow-y-auto rounded border border-[#202631] bg-[#0c1017] p-2 text-xs leading-relaxed text-stone-200 outline-none focus:border-amber-500/40"
              aria-label={`${block.type === "video" ? "Video" : "Audio"} transcript input`}
            />
          </div>
        )}
      </div>
    );
  };

  const renderDynamicBuilder = (step: StudyStepId) => {
    const blocks = getBlocks(step);
    const toggleBlockCollapse = (blockId: string) => {
      setExpandedBlocks((current) => ({ ...current, [blockId]: !(current[blockId] ?? false) }));
    };
    const moveBlock = (index: number, direction: -1 | 1) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= blocks.length) return;
      const nextBlocks = [...blocks];
      [nextBlocks[index], nextBlocks[nextIndex]] = [nextBlocks[nextIndex], nextBlocks[index]];
      
      // Update local state
      updateBlocks(step, nextBlocks);
      
      // Sync to Supabase
      reorderBlocks(step, index, nextIndex).catch((error: any) => {
        console.error("Failed to reorder blocks:", error);
      });
    };

    const handleAddBlock = (type: ContentBlockType) => {
      if (!type) return;
      const newBlock = createBlock(type);
      updateBlocks(step, [...blocks, newBlock]);
      
      // Sync to Supabase
      addBlock(step, newBlock).catch((error: any) => {
        console.error("Failed to add block:", error);
      });
    };

    const handleDeleteBlock = (index: number, blockId: string) => {
      // Tear down any in-flight recording for the deleted block.
      const rec = recorderRef.current.get(blockId);
      if (rec?.state === "recording") discardOnStopRef.current.add(blockId);
      try {
        if (rec?.state === "recording") rec.stop();
      } catch {
        // ignore
      }
      stopTracks(streamRef.current.get(blockId) || null);
      chunksRef.current.delete(blockId);
      recorderRef.current.delete(blockId);
      streamRef.current.delete(blockId);
      setRecordingState(blockId, null);
      setOpenTranscript((current) => {
        if (!(blockId in current)) return current;
        const { [blockId]: _omit, ...rest } = current;
        return rest;
      });
      updateBlocks(step, blocks.filter((_, blockIndex) => blockIndex !== index));
      
      // Sync to Supabase
      deleteBlock(step, blockId).catch((error: any) => {
        console.error("Failed to delete block:", error);
      });
    };

    return (
      <div className="space-y-3 rounded-lg border border-amber-500/40 bg-[#0c1017]/70 p-3">
        <div className="flex flex-col justify-between gap-2 border-b border-[#202631] pb-3 sm:flex-row sm:items-center">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Content Builder</p>
            <p className="mt-1 text-xs text-stone-500">Arrange reusable blocks in the exact order students should see them.</p>
          </div>
          <select
            value=""
            onChange={(event) => {
              handleAddBlock(event.target.value as ContentBlockType);
            }}
            aria-label={`Add content block to ${step}`}
            className="min-h-9 rounded border border-amber-500/40 bg-[#0c1017] px-3 text-xs font-normal text-stone-200 [color-scheme:dark] outline-none transition hover:border-amber-500/40 focus:border-amber-500/40"
          >
            <option value="" className="bg-slate-900 text-slate-100">+ Add Content Block</option>
            <option value="text" className="bg-slate-900 text-slate-100">Text Block</option>
            <option value="audio" className="bg-slate-900 text-slate-100">Audio Block</option>
            <option value="video" className="bg-slate-900 text-slate-100">Video Block</option>
            <option value="image" className="bg-slate-900 text-slate-100">Image Block</option>
            <option value="resource" className="bg-slate-900 text-slate-100">Resource / Document Block</option>
            <option value="quiz" className="bg-slate-900 text-slate-100">Quiz / Exercise Block</option>
            <option value="writing" className="bg-slate-900 text-slate-100">Writing Block</option>
          </select>
        </div>

        {blocks.length === 0 && <p className="py-3 text-xs text-stone-500">No content blocks yet. Add a block to begin building this step.</p>}
        {blocks.map((block, index) => {
          const isExpanded = expandedBlocks[block.id] ?? false;
          const isActive = block.is_active ?? block.enabled !== false;
          return (
          <div key={block.id} id={`lesson-builder-block-${block.id}`} className={`scroll-mt-24 rounded-md border border-[#202631] bg-[#171d28] p-3 transition-opacity ${isActive ? "opacity-100" : "opacity-55"}`}>
            <div className="mb-3 flex cursor-pointer items-center justify-between gap-2" onClick={() => toggleBlockCollapse(block.id)}>
              <button type="button" onClick={(event) => { event.stopPropagation(); toggleBlockCollapse(block.id); }} className="flex min-w-0 items-center gap-2 text-left text-[10px]  uppercase tracking-[0.12em] text-amber-400 hover:text-amber-400" aria-expanded={isExpanded} aria-controls={`block-content-${block.id}`}>
                {isExpanded ? <ChevronUp className="h-3.5 w-3.5 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0" />}
                {block.icon && <DynamicLucideIcon name={block.icon} className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                <span className="truncate">{index + 1}. {block.type} block{!isActive ? " · Inactive" : ""} - {block.title || "Untitled"}</span>
              </button>
              <div className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
                <button type="button" onClick={() => updateDynamicBlock(step, index, { is_active: !isActive, enabled: !isActive })} role="switch" aria-checked={isActive} className={`mr-1 inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px]  transition ${isActive ? "border-emerald-500/50 text-emerald-300" : "border-[#394252] text-stone-500"}`}>
                  <span className={`h-2 w-2 rounded-full ${isActive ? "bg-emerald-400" : "bg-stone-600"}`} />{isActive ? "Active" : "Inactive"}
                </button>
                <button type="button" onClick={() => moveBlock(index, -1)} disabled={index === 0} className="rounded p-1 text-stone-400 hover:bg-[#0c1017] hover:text-amber-400 disabled:opacity-30" aria-label="Move block up"><MoveUp className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => moveBlock(index, 1)} disabled={index === blocks.length - 1} className="rounded p-1 text-stone-400 hover:bg-[#0c1017] hover:text-amber-400 disabled:opacity-30" aria-label="Move block down"><MoveDown className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => handleDeleteBlock(index, block.id)} className="rounded p-1 text-stone-400 hover:bg-[#0c1017] hover:text-red-300" aria-label="Delete block"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
            <div id={`block-content-${block.id}`} className={`transition-opacity duration-200 ${isExpanded ? "h-auto overflow-visible opacity-100" : "h-0 overflow-hidden opacity-0"}`} aria-hidden={!isExpanded}>
            <input value={block.title} onChange={(event) => updateDynamicBlock(step, index, { title: event.target.value })} placeholder="Block title" className="mb-2 w-full rounded border border-[#202631] bg-[#0c1017] p-2 text-xs text-stone-200 outline-none focus:border-amber-500/40" aria-label={`${block.type} block title`} />
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded border border-[#29303c] bg-[#0c1017]/60 px-3 py-2">
              <span className="text-xs font-medium text-stone-300">Block Icon</span>
              <div className="flex items-center gap-2">
                <LucideIconPicker value={block.icon || ""} triggerLabel="Select Icon" onChange={(icon) => updateDynamicBlock(step, index, { icon })} />
                {block.icon && <button type="button" onClick={() => updateDynamicBlock(step, index, { icon: undefined })} className="text-[11px] text-stone-500 underline hover:text-stone-300">Clear</button>}
              </div>
            </div>
            <div className="mb-3 grid gap-2 sm:grid-cols-3">
              <label className="text-[11px] text-stone-500">Layout mode
                <select value={block.layoutMode || "global"} onChange={(event) => updateDynamicBlock(step, index, { layoutMode: event.target.value as "global" | "inline-row", sidebarBlockId: event.target.value === "global" ? undefined : block.sidebarBlockId })} className="mt-1 w-full rounded border border-[#202631] bg-[#0c1017] p-2 text-xs text-stone-200 [color-scheme:dark]" aria-label={`${block.type} block layout mode`}>
                  <option value="global">Global Column Mode</option>
                  <option value="inline-row">Inline Row Section Mode</option>
                </select>
              </label>
              {block.layoutMode === "inline-row" && <label className="text-[11px] text-stone-500">Sidebar block
                <select value={block.sidebarBlockId || ""} onChange={(event) => updateDynamicBlock(step, index, { sidebarBlockId: event.target.value || undefined })} className="mt-1 w-full rounded border border-[#202631] bg-[#0c1017] p-2 text-xs text-stone-200 [color-scheme:dark]" aria-label={`${block.type} block sidebar selection`}>
                  <option value="">No sidebar block</option>
                  {(sidebarBlocksByStep[step] || []).map((sidebarBlock) => <option key={sidebarBlock.id} value={sidebarBlock.id}>{sidebarBlock.title || "Untitled sidebar block"}</option>)}
                </select>
              </label>}
              {block.layoutMode === "inline-row" && <label className="text-[11px] text-stone-500">When empty
                <select value={block.rowEmptyMode || "full"} onChange={(event) => updateDynamicBlock(step, index, { rowEmptyMode: event.target.value as "full" | "empty" })} className="mt-1 w-full rounded border border-[#202631] bg-[#0c1017] p-2 text-xs text-stone-200 [color-scheme:dark]" aria-label={`${block.type} block empty row mode`}>
                  <option value="full">Expand main content</option>
                  <option value="empty">Leave sidebar space</option>
                </select>
              </label>}
            </div>
            {block.type === "text" && <div className="space-y-3">
              <label className="flex cursor-pointer items-start gap-3 rounded border border-[#202631] bg-[#0c1017]/60 p-3">
                <input type="checkbox" checked={block.hasStudentResponseInput === true || block.studentResponseConfig?.enabled === true} onChange={(event) => updateDynamicBlock(step, index, { hasStudentResponseInput: event.target.checked, studentResponseConfig: { ...(block.studentResponseConfig || { allowedTypes: ["text"] }), enabled: event.target.checked } })} className="mt-0.5 h-4 w-4 shrink-0 accent-amber-500" />
                <span>
                  <span className="block text-xs font-semibold text-stone-200">Enable Student Response Field</span>
                  <span className="mt-1 block text-[11px] leading-relaxed text-stone-500">Allows students to submit notes or answers for this block.</span>
                </span>
              </label>
              {(block.hasStudentResponseInput === true || block.studentResponseConfig?.enabled === true) && <label className="block text-xs text-stone-500">Student response type<select value={block.studentResponseType || "text"} onChange={(event) => updateDynamicBlock(step, index, { studentResponseType: event.target.value as "text" | "voice" | "audio" | "file" })} className="mt-1 w-full rounded border border-[#202631] bg-[#0c1017] p-2 text-xs text-stone-200 [color-scheme:dark]" aria-label="Student response type"><option value="text">Text response</option><option value="voice">Voice response</option><option value="audio">Audio response</option><option value="file">File upload</option></select></label>}
              <TiptapEditor value={block.body} onChange={(value) => updateDynamicBlock(step, index, { body: value })} placeholder="Start typing lesson content or use formatting options..." ariaLabel="Text block body" />
              {(block.hasStudentResponseInput === true || block.studentResponseConfig?.enabled === true) && (block.studentResponseType || "text") === "text" && <textarea rows={6} placeholder="Write your response here..." readOnly className="min-h-[140px] w-full resize-y rounded border border-[#394252] bg-[#171d28] p-3 text-sm text-stone-400" aria-label="Student response field preview" />}
              {(block.hasStudentResponseInput === true || block.studentResponseConfig?.enabled === true) && (block.studentResponseType === "voice" || block.studentResponseType === "audio") && <div className="flex items-center gap-2 rounded border border-[#394252] bg-[#171d28] p-3 text-xs text-stone-400"><Mic className="h-4 w-4 text-amber-400" />Voice recorder preview</div>}
              {(block.hasStudentResponseInput === true || block.studentResponseConfig?.enabled === true) && block.studentResponseType === "file" && <div className="rounded border border-[#394252] bg-[#171d28] p-3 text-xs text-stone-400">File upload preview</div>}
            </div>}
            {block.type === "audio" && (() => {
              const rec = recordingByBlockId[block.id];
              const isRecording = rec?.status === "recording";
              const isUploading = rec?.status === "uploading";
              return (
                <div className="space-y-2">
                  <MediaAssetInput kind="audio" value={block.audioUrl.startsWith("data:") ? "" : block.audioUrl} onChange={(value) => updateDynamicBlock(step, index, { audioUrl: value })} disabled={isRecording || isUploading} />
                  <label className="flex cursor-pointer items-start gap-3 rounded border border-[#202631] bg-[#0c1017]/60 p-3">
                    <input type="checkbox" checked={block.allowStudentVoiceResponse === true} onChange={(event) => updateDynamicBlock(step, index, { allowStudentVoiceResponse: event.target.checked })} className="mt-0.5 h-4 w-4 shrink-0 accent-amber-500" />
                    <span><span className="block text-xs font-semibold text-stone-200">Allow Student Voice Response / Shadowing Record</span><span className="mt-1 block text-[11px] leading-relaxed text-stone-500">Lets students record a response beneath this audio lesson.</span></span>
                  </label>
                  <div className="flex flex-row flex-wrap items-center gap-2">
                    {!isRecording ? (
                      <button type="button" onClick={() => void startRecording(block.id, step, index)} disabled={isUploading} className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 px-2.5 py-1.5 text-xs  text-amber-400 transition hover:bg-amber-500/20 hover:text-amber-400 disabled:opacity-40" aria-label="Record voice for audio block"><Mic className="h-3.5 w-3.5" />{isUploading ? "Uploading…" : "Record voice"}</button>
                    ) : (
                      <div className="flex w-full flex-row items-center gap-3 rounded-lg border border-red-500/30 bg-[#0c1017] px-3 py-1.5">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500 animate-pulse" aria-hidden />
                        <span className="text-xs font-mono tabular-nums text-red-300">{fmt(rec?.elapsed||0)}</span>
                        <div className="flex items-end gap-[2px] h-6" aria-hidden>{(rec?.levels||Array(18).fill(5)).map((h,i)=><span key={i} className="w-[3px] rounded-full bg-amber-500/20" style={{height:h}} />)}</div>
                        <button type="button" onClick={() => stopRecording(block.id)} className="inline-flex items-center gap-1.5 rounded-md bg-red-500 px-2.5 py-1.5 text-xs  text-white hover:bg-red-400"><Square className="h-3 w-3 fill-current" />Stop & save</button>
                        <button type="button" onClick={() => cancelRecording(block.id)} className="rounded-md border border-[#394252] px-2.5 py-1.5 text-xs text-stone-400 hover:border-red-400 hover:text-red-300">Cancel</button>
                      </div>
                    )}
                    {rec?.error && <span className="text-[11px] text-red-300" role="status">{rec.error}</span>}
                    {rec?.status === "error" && <button type="button" onClick={() => setRecordingState(block.id, null)} className="text-[11px] text-stone-400 underline hover:text-stone-200">Dismiss</button>}
                  </div>
                  {block.audioUrl && <CustomAudioPlayer src={block.audioUrl} label={block.title || "Audio lesson"} />}
                  {renderTranscriptField(step, index, block)}
                </div>
              );
            })()}
            {block.type === "question" && <QuestionSettings value={block.optionIndexingStyle} onChange={(value) => updateDynamicBlock(step, index, { optionIndexingStyle: value })} />}
            {block.type === "fill-in-the-blanks" && <div className="space-y-3"><div className="flex w-fit rounded border border-[#394252] p-0.5" role="tablist" aria-label="Fill in the blanks editor mode"><button type="button" role="tab" aria-selected={fillBlankModes[block.id] !== "preview"} onClick={() => setFillBlankModes((current) => ({ ...current, [block.id]: "edit" }))} className={`px-3 py-1 text-xs ${fillBlankModes[block.id] !== "preview" ? "bg-amber-500/20 text-amber-400" : "text-stone-400 hover:text-stone-200"}`}>Edit</button><button type="button" role="tab" aria-selected={fillBlankModes[block.id] === "preview"} onClick={() => setFillBlankModes((current) => ({ ...current, [block.id]: "preview" }))} className={`px-3 py-1 text-xs ${fillBlankModes[block.id] === "preview" ? "bg-amber-500/20 text-amber-400" : "text-stone-400 hover:text-stone-200"}`}>Preview</button></div>{fillBlankModes[block.id] === "preview" ? <FillInBlanksMarkdown blockId={block.id} text={block.textWithBlanks} acceptableAnswers={block.acceptableAnswers} wordBank={block.wordBank} caseSensitive={block.caseSensitive} values={fillBlankPreviewValues} readOnly onChange={(blankIndex, value) => setFillBlankPreviewValues((current) => ({ ...current, [`${block.id}-blank-${blankIndex}`]: value }))} className="rounded border border-[#202631] bg-[#0c1017]/50 p-3 text-sm leading-relaxed text-stone-300" /> : <><label className="block text-xs font-semibold text-stone-300">Exercise Content (put each answer in brackets, e.g. [answer]):<TiptapEditor value={block.textWithBlanks} onChange={(textWithBlanks) => { const acceptableAnswers = parseFillInBlanks(textWithBlanks).map((blank) => [blank.answer]); updateDynamicBlock(step, index, { textWithBlanks, acceptableAnswers }); }} placeholder="The capital of France is [Paris]." ariaLabel="Fill in the blanks exercise content" /></label><label className="block text-xs font-semibold text-stone-300">Word Bank Options (Optional - separate words with commas or new lines):<textarea value={(block.wordBank || []).join("\n")} onChange={(event) => updateDynamicBlock(step, index, { wordBank: event.target.value.split(/[\n,]/).map((word) => word.trim()).filter(Boolean) })} placeholder="Paris\nFrance\nLondon" rows={3} className="mt-1 w-full resize-y rounded border border-[#202631] bg-[#0c1017] p-2 text-xs font-normal text-stone-200 outline-none focus:border-amber-500/40" aria-label="Fill in the blanks word bank" /></label><p className="text-[11px] leading-relaxed text-stone-500">Add one draggable word per line, or separate words with commas.</p></>}<p className="text-[11px] leading-relaxed text-stone-500">Use the toolbar to format text. Put each correct answer in square brackets.</p><label className="flex cursor-pointer items-center gap-2 text-xs text-stone-300"><input type="checkbox" checked={block.caseSensitive === true} onChange={(event) => updateDynamicBlock(step, index, { caseSensitive: event.target.checked })} className="h-4 w-4 accent-amber-500" />Case-sensitive answers</label></div>}
            {block.type === "video" && (() => {
              const reflectionExpanded = openReflectionSettings[block.id] ?? false;
              return (
                <div className="space-y-3">
                  <MediaAssetInput kind="video" value={block.videoUrl} onChange={(value) => updateDynamicBlock(step, index, { videoUrl: value })} />
                  <InteractiveVideoBlock videoUrl={block.videoUrl} title={block.title || "Lesson video"} transcript={block.transcript} editable showTranscript={false} />
                  {renderTranscriptField(step, index, block)}
                  <div className="overflow-hidden rounded border border-[#202631] bg-[#0c1017]/50">
                    <div className="flex items-center justify-between gap-3 px-3 py-2">
                      <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-stone-300">
                        <input type="checkbox" checked={block.show_reflection_prompt !== false} onChange={(event) => updateDynamicBlock(step, index, { show_reflection_prompt: event.target.checked })} className="h-4 w-4 accent-amber-500" />
                        Include Reflection Question below video
                      </label>
                      <button type="button" onClick={() => setOpenReflectionSettings((current) => ({ ...current, [block.id]: !reflectionExpanded }))} aria-expanded={reflectionExpanded} aria-label={`${reflectionExpanded ? "Collapse" : "Expand"} reflection question settings`} className="rounded p-1 text-stone-400 hover:bg-[#202631] hover:text-amber-400">
                        {reflectionExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                    </div>
                    {block.show_reflection_prompt !== false && reflectionExpanded && (
                      <div className="border-t border-[#29303c] p-3">
                        <TiptapEditor value={block.reflection_prompt_text || ""} onChange={(reflection_prompt_text) => updateDynamicBlock(step, index, { reflection_prompt_text })} placeholder="Think of an everyday product or app you use that frustrates you..." ariaLabel="Reflection question" compact />
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
            {block.type === "writing" && <WritingBlockEditor block={block} onChange={(changes) => updateDynamicBlock(step, index, changes)} />}
            {block.type === "image" && <div className="space-y-2"><MediaAssetInput kind="image" value={block.imageUrl} onChange={(value) => updateDynamicBlock(step, index, { imageUrl: value })} /><input value={block.caption} onChange={(event) => updateDynamicBlock(step, index, { caption: event.target.value })} placeholder="Image caption" className="w-full rounded border border-[#202631] bg-[#0c1017] p-2 text-xs text-stone-200 outline-none focus:border-amber-500/40" aria-label="Image block caption" /></div>}
            {block.type === "resource" && <div className="space-y-2"><MediaAssetInput kind="resource" value={block.resourceUrl} onChange={(value) => updateDynamicBlock(step, index, { resourceUrl: value })} /><input value={block.description || ""} onChange={(event) => updateDynamicBlock(step, index, { description: event.target.value })} placeholder="Document description" className="w-full rounded border border-[#202631] bg-[#0c1017] p-2 text-xs text-stone-200 outline-none focus:border-amber-500/40" aria-label="Document description" /></div>}
            {block.type === "question" && (
              <div className="space-y-2">
                <label className="block text-xs text-stone-500">Question type
                  <select value={block.question_type || "multiple_choice"} onChange={(event) => updateDynamicBlock(step, index, { question_type: event.target.value as "multiple_choice" | "open_ended" })} className="mt-1 w-full rounded border border-[#202631] bg-[#0c1017] p-2 text-xs text-stone-200 [color-scheme:dark]" aria-label="Question type">
                    <option value="multiple_choice">Multiple Choice</option>
                    <option value="open_ended">Open-Ended Response</option>
                  </select>
                </label>
                <TiptapEditor value={block.prompt} onChange={(value) => updateDynamicBlock(step, index, { prompt: value })} placeholder="Question or task prompt" ariaLabel="Question or task prompt" />
                {(block.question_type || "multiple_choice") === "open_ended" ? (
                  <TiptapEditor value={block.sample_answer || ""} onChange={(value) => updateDynamicBlock(step, index, { sample_answer: value })} placeholder="Optional model answer or evaluation guide" ariaLabel="Sample answer or instructor guide" />
                ) : (
                  <>
                    {block.options.map((option, optionIndex) => (
                      <div key={`${block.id}-${optionIndex}`} className="flex gap-2">
                        <input value={option} onChange={(event) => updateDynamicBlock(step, index, { options: block.options.map((value, valueIndex) => valueIndex === optionIndex ? event.target.value : value) })} placeholder={`Option ${optionIndex + 1} (optional)`} className="min-w-0 flex-1 rounded border border-[#202631] bg-[#0c1017] p-2 text-xs text-stone-200 outline-none focus:border-amber-500/40" aria-label={`Question option ${optionIndex + 1}`} />
                        <button type="button" onClick={() => updateDynamicBlock(step, index, { options: block.options.filter((_, valueIndex) => valueIndex !== optionIndex) })} disabled={block.options.length <= 1} aria-label={`Remove question option ${optionIndex + 1}`} className="rounded border border-[#394252] px-2 text-stone-500 hover:border-red-400 hover:text-red-300 disabled:opacity-30"><X className="h-3.5 w-3.5" /></button>
                      </div>
                    ))}
                    <button type="button" onClick={() => updateDynamicBlock(step, index, { options: [...block.options, ""] })} className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-400"><Plus className="h-3 w-3" /> Add option</button>
                    <input value={block.correct_answer} onChange={(event) => updateDynamicBlock(step, index, { correct_answer: event.target.value })} placeholder="Correct Answer / Key" className="w-full rounded border border-amber-500/40 bg-[#0c1017] p-2 text-xs text-stone-200 outline-none focus:border-amber-500/40" aria-label="Correct Answer / Key" />
                  </>
                )}
              </div>
            )}
            {block.type === "quiz" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-stone-400">
                  <span>Questions</span>
                  <button
                    type="button"
                    onClick={() => updateDynamicBlock(step, index, {
                      questions: [...block.questions, {
                        id: `${block.id}-q-${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`,
                        type: "multiple_choice",
                        prompt: "",
                        options: ["", "", ""],
                        correct_answer: "",
                      }],
                    })}
                    className="flex items-center gap-1 text-amber-400 hover:text-amber-300"
                  >
                    <Plus className="h-3 w-3" /> Add Question
                  </button>
                </div>
                {block.questions.map((question, questionIndex) => {
                  const questionType: ExerciseQuestionType = question.type || "multiple_choice";
                  const updateQuestion = (patch: Partial<QuizQuestion>) => updateDynamicBlock(step, index, {
                    questions: block.questions.map((item, itemIndex) => itemIndex === questionIndex ? { ...item, ...patch } : item),
                  });
                  return (
                    <section key={`${question.id || "question"}-${questionIndex}`} className="space-y-3 rounded border border-[#202631] bg-[#0c1017] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-xs font-semibold text-stone-200">Question {questionIndex + 1}</h4>
                        <button
                          type="button"
                          onClick={() => updateDynamicBlock(step, index, { questions: block.questions.filter((_, itemIndex) => itemIndex !== questionIndex) })}
                          disabled={block.questions.length <= 1}
                          aria-label={`Remove question ${questionIndex + 1}`}
                          className="rounded p-1 text-stone-500 hover:bg-[#171d28] hover:text-red-300 disabled:opacity-30"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <label className="block text-xs text-stone-500">
                        Question type
                        <select
                          value={questionType}
                          onChange={(event) => {
                            const type = event.target.value as ExerciseQuestionType;
                            updateQuestion({
                              type,
                              options: type === "true_false_not_given" ? ["True", "False", "Not Given"] : type === "multiple_choice" ? (question.options?.length ? question.options : ["", "", ""]) : [],
                              correct_answer: "",
                              sample_answer: undefined,
                              acceptableAnswers: undefined,
                            });
                          }}
                          className="mt-1 w-full rounded border border-[#394252] bg-[#171d28] p-2 text-xs text-stone-200 [color-scheme:dark]"
                          aria-label={`Question ${questionIndex + 1} type`}
                        >
                          <option value="multiple_choice">Multiple Choice</option>
                          <option value="true_false_not_given">True / False / Not Given</option>
                          <option value="fill_in_the_blanks">Fill in the Blanks (Cloze / Drag & Drop)</option>
                          <option value="short_answer">Short Answer / Open Question</option>
                        </select>
                      </label>
                      <div className="space-y-1">
                        <p className="text-xs text-stone-500">Section Title / Instructions (Optional)</p>
                        <TiptapEditor
                          value={question.sectionHeader || ""}
                          onChange={(sectionHeader) => updateQuestion({ sectionHeader })}
                          placeholder="Add section remarks or guidelines for this question..."
                          ariaLabel={`Question ${questionIndex + 1} section title or instructions`}
                          compact
                        />
                      </div>
                      {questionType === "fill_in_the_blanks" ? (
                        <div className="block space-y-1.5">
                          <span className="block text-xs font-medium text-stone-300">Question Text (Sentence with Blanks)</span>
                          <TiptapEditor
                            value={getQuizQuestionPrompt(question)}
                            onChange={(text) => {
                              updateQuestion({
                                text,
                                prompt: text,
                                acceptableAnswers: parseFillInBlanks(text).map((blank) => [blank.answer]),
                              });
                            }}
                            placeholder="The capital of France is [Paris]."
                            ariaLabel={`Question ${questionIndex + 1} text with blanks`}
                          />
                          <span className="block text-[11px] leading-relaxed text-stone-500">
                            Type your sentences here and put each correct answer in square brackets, e.g. The capital of France is [Paris].
                          </span>
                        </div>
                      ) : (
                        <TiptapEditor
                          value={getQuizQuestionPrompt(question)}
                          onChange={(prompt) => updateQuestion({ prompt })}
                          placeholder={`Write question ${questionIndex + 1}`}
                          ariaLabel={`Question ${questionIndex + 1} prompt`}
                          compact
                          defaultBold
                        />
                      )}
                      {questionType === "multiple_choice" && (
                        <div className="space-y-2">
                          {question.options?.map((option, optionIndex) => (
                            <div key={`${question.id}-${optionIndex}`} className="flex gap-2">
                              <input
                                value={option}
                                onChange={(event) => updateQuestion({ options: (question.options || []).map((value, valueIndex) => valueIndex === optionIndex ? event.target.value : value) })}
                                placeholder={`Option ${optionIndex + 1}`}
                                className="min-w-0 flex-1 rounded border border-[#394252] bg-[#171d28] p-2 text-xs text-stone-200"
                                aria-label={`Question ${questionIndex + 1} option ${optionIndex + 1}`}
                              />
                              <button
                                type="button"
                                onClick={() => updateQuestion({ options: (question.options || []).filter((_, valueIndex) => valueIndex !== optionIndex) })}
                                disabled={(question.options || []).length <= 2}
                                aria-label={`Remove question ${questionIndex + 1} option ${optionIndex + 1}`}
                                className="rounded border border-[#394252] px-2 text-stone-500 hover:text-red-300 disabled:opacity-30"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                          <button type="button" onClick={() => updateQuestion({ options: [...(question.options || []), ""] })} className="flex items-center gap-1 text-xs text-amber-400">
                            <Plus className="h-3 w-3" /> Add option
                          </button>
                        </div>
                      )}
                      {questionType === "fill_in_the_blanks" && (
                        <div className="space-y-2">
                          <textarea
                            value={(question.wordBank || []).join("\n")}
                            onChange={(event) => updateQuestion({ wordBank: event.target.value.split(/[\n,]/).map((word) => word.trim()).filter(Boolean) })}
                            placeholder="Optional word bank (one item per line)"
                            rows={2}
                            className="w-full resize-y rounded border border-[#394252] bg-[#171d28] p-2 text-xs text-stone-200"
                            aria-label={`Question ${questionIndex + 1} word bank`}
                          />
                          <p className="text-[11px] text-stone-500">Type one answer per line. You can also separate answers with commas.</p>
                          <label className="flex items-center gap-2 text-xs text-stone-400">
                            <input type="checkbox" checked={question.caseSensitive === true} onChange={(event) => updateQuestion({ caseSensitive: event.target.checked })} className="h-4 w-4 accent-amber-500" />
                            Case-sensitive answers
                          </label>
                        </div>
                      )}
                      {questionType === "true_false_not_given" ? (
                        <label className="block text-xs text-stone-500">Correct answer
                          <select value={question.correct_answer || ""} onChange={(event) => updateQuestion({ correct_answer: event.target.value })} className="mt-1 w-full rounded border border-amber-500/40 bg-[#171d28] p-2 text-xs text-stone-200 [color-scheme:dark]">
                            <option value="">Select correct answer</option>
                            <option value="True">True</option>
                            <option value="False">False</option>
                            <option value="Not Given">Not Given</option>
                          </select>
                        </label>
                      ) : questionType === "multiple_choice" ? (
                        <input value={question.correct_answer || question.correctAnswer || ""} onChange={(event) => updateQuestion({ correct_answer: event.target.value })} placeholder="Correct answer (match an option)" className="w-full rounded border border-amber-500/40 bg-[#171d28] p-2 text-xs text-stone-200" aria-label={`Question ${questionIndex + 1} correct answer`} />
                      ) : questionType === "short_answer" ? (
                        <TiptapEditor value={question.sample_answer || question.correct_answer || ""} onChange={(sample_answer) => updateQuestion({ sample_answer, correct_answer: sample_answer })} placeholder="Optional sample answer / evaluation key" ariaLabel={`Question ${questionIndex + 1} sample answer`} compact />
                      ) : (
                        <input value={question.correct_answer || ""} onChange={(event) => updateQuestion({ correct_answer: event.target.value })} placeholder="Optional answer key (defaults to bracketed answers)" className="w-full rounded border border-amber-500/40 bg-[#171d28] p-2 text-xs text-stone-200" aria-label={`Question ${questionIndex + 1} answer key`} />
                      )}
                    </section>
                  );
                })}
              </div>
            )}
            </div>
          </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex min-w-0 flex-col gap-3 text-[#d9dce0] md:flex-row md:items-stretch">
      <aside className={`min-w-0 shrink-0 transition-[width] duration-300 ease-in-out md:sticky md:top-24 md:self-start ${isBuilderSidebarOpen ? "w-full md:w-[min(16rem,33.333%)]" : "w-full md:w-14"}`}>
        <div className="overflow-hidden rounded-xl border border-[#202631] bg-[#171d28]/80 md:max-h-[calc(100vh-7rem)] md:overflow-y-auto">
          <div className={`flex items-center border-b border-[#202631] p-3 ${isBuilderSidebarOpen ? "justify-between" : "justify-center"}`}>
            {isBuilderSidebarOpen && <p className="truncate text-xs font-semibold uppercase tracking-[0.12em] text-amber-400">Builder Navigation</p>}
            <button
              type="button"
              onClick={() => setIsBuilderSidebarOpen((open) => !open)}
              aria-label={isBuilderSidebarOpen ? "Collapse builder sidebar" : "Expand builder sidebar"}
              aria-expanded={isBuilderSidebarOpen}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-[#394252] text-stone-300 transition hover:border-amber-500/40 hover:text-amber-400"
            >
              {isBuilderSidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          </div>

          {isBuilderSidebarOpen && (
            <div className="space-y-4 p-3">
              <section aria-label="Primary actions">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">Quick Actions</p>
                {onPreview && (
                  <button
                    type="button"
                    onClick={onPreview}
                    className="flex w-full items-center gap-2 rounded-md border border-[#394252] bg-[#0c1017] px-3 py-2 text-left text-xs text-stone-300 transition hover:border-amber-500/40 hover:text-white"
                  >
                    <Eye className="h-3.5 w-3.5 text-amber-400" /> Preview Student View
                  </button>
                )}
              </section>

              <nav aria-label="Lesson stage navigator">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">Stages</p>
                <div className="space-y-1">
                  {STUDY_STEPS.filter((stage) => stage.id !== "results").map((stage) => {
                    const isActive = activeStep === stage.id;
                    const stageBlockCount = getBlocks(stage.id).length;
                    return (
                      <button
                        key={stage.id}
                        type="button"
                        onClick={() => navigateToStep(stage.id)}
                        aria-current={isActive ? "step" : undefined}
                        className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs transition ${isActive ? "bg-amber-500/10 text-amber-400" : "text-stone-400 hover:bg-[#0c1017] hover:text-stone-200"}`}
                      >
                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[9px] ${isActive ? "border-amber-500/50 bg-amber-500/20" : "border-[#394252]"}`}>{stage.stepNumber}</span>
                        <span className="min-w-0 flex-1 truncate">{stage.label}</span>
                        <span className="text-[10px] text-stone-500">{stageBlockCount}</span>
                      </button>
                    );
                  })}
                </div>
              </nav>

              <nav aria-label="Lesson block outline">
                <p className="mb-2 truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">Lesson Outline</p>
                <div className="space-y-1">
                  {STUDY_STEPS.filter((stage) => stage.id !== "results").map((stage) => {
                    const stageBlocks = getBlocks(stage.id);
                    return (
                      <details key={stage.id} open={stage.id === activeStep} className="rounded">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded px-2 py-1.5 text-[11px] text-stone-400 hover:bg-[#0c1017] hover:text-stone-200">
                          <span className="truncate">{stage.label}</span>
                          <span className="shrink-0 text-[10px] text-stone-600">{stageBlocks.length}</span>
                        </summary>
                        {stageBlocks.length > 0 ? (
                          <div className="ml-2 border-l border-[#293343] py-1 pl-1">
                            {stageBlocks.map((block, index) => (
                              <button
                                key={block.id}
                                type="button"
                                onClick={() => {
                                  if (activeStep !== stage.id) pendingBlockScrollRef.current = block.id;
                                  navigateToStep(stage.id);
                                  if (activeStep === stage.id) scrollToBlock(block.id);
                                }}
                                className="flex w-full min-w-0 items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] text-stone-500 transition hover:bg-[#0c1017] hover:text-amber-300"
                              >
                                <span className="shrink-0 text-stone-600">{index + 1}.</span>
                                <span className="truncate">{block.title || `${block.type} block`}</span>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="px-3 py-1 text-[10px] text-stone-600">No blocks</p>
                        )}
                      </details>
                    );
                  })}
                </div>
              </nav>

              <section className="border-t border-[#202631] pt-3" aria-label="Lesson status">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">Lesson Status</p>
                <div className="space-y-1 text-[11px]">
                  <p className="flex justify-between gap-2 text-stone-400"><span>Stages with content</span><span className="text-stone-200">{STUDY_STEPS.filter((stage) => stage.id !== "results" && getBlocks(stage.id).length > 0).length}/6</span></p>
                  <p className="flex justify-between gap-2 text-stone-400"><span>Active blocks</span><span className="text-emerald-300">{activeBlockCount}/{allLessonBlocks.length}</span></p>
                </div>
              </section>
            </div>
          )}
        </div>
      </aside>

      <div className="min-w-0 flex-1 rounded-xl border border-[#202631] bg-[#171d28]/60 p-3 text-[#d9dce0] sm:p-5">
        <div className="mb-4 flex items-center justify-between border-b border-[#202631] pb-3">
          <h2 className="flex items-center gap-2 font-sans text-xl font-semibold">
            <Layers className="h-5 w-5 text-amber-400" />
            Lesson Content Tailor
          </h2>
          {onPreview && (
            <button
              type="button"
              onClick={onPreview}
              className="flex items-center gap-1.5 rounded-lg border border-[#202631] bg-[#0c1017] px-3 py-1.5 text-xs text-stone-300 transition hover:text-white"
            >
              <Eye className="h-3.5 w-3.5" /> Preview Student View
            </button>
          )}
        </div>
        <div className="space-y-4">
          {renderDynamicBuilder(activeStep)}
        </div>
      </div>
    </div>
  );
}

export default LessonTailorEditor;
