"use client";

import React, { useEffect, useRef, useState } from "react";
import { ContentBlock, ContentBlockType, OptionIndexingStyle, STUDY_STEPS, StudyStepId, StrictStepContent } from "@/types/lesson";
import { useLessonEditorStore } from "@/lib/lesson-editor-store";
import { CustomAudioPlayer } from "@/components/study-room/custom-audio-player";
import { InteractiveVideoBlock } from "@/components/shared/interactive-video-block";
import { MarkdownContent } from "@/components/study-room/markdown-content";
import { uploadLessonAsset, uploadLessonMedia } from "@/services/storage-service";
import { Eye, FileText, Layers, Lightbulb, LoaderCircle, MoveDown, MoveUp, Plus, Trash2, UploadCloud, X, ChevronDown, ChevronUp, HelpCircle, Mic, Square } from "lucide-react";

interface LessonTailorEditorProps {
  content: StrictStepContent;
  onChange?: (updatedContent: StrictStepContent) => void;
  onPreview?: () => void;
  sidebarBlocksByStep?: Partial<Record<StudyStepId, { id: string; title: string; body: string }[]>>;
}

function MarkdownEditor({
  value,
  onChange,
  onHelp,
  placeholder,
  ariaLabel,
  rows = 4,
}: {
  value: string;
  onChange: (value: string) => void;
  onHelp: () => void;
  placeholder: string;
  ariaLabel: string;
  rows?: number;
}) {
  const [mode, setMode] = useState<"write" | "preview">("write");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const selectionRef = useRef({ start: value.length, end: value.length });
  const colorPalette = [
    { name: "Gray", value: "#9ca3af" },
    { name: "Amber", value: "#f59e0b" },
    { name: "Coral", value: "#ef4444" },
    { name: "Emerald", value: "#10b981" },
    { name: "Cyan", value: "#06b6d4" },
    { name: "Purple", value: "#d946ef" },
  ];
  const updateSelection = (prefix: string, suffix = "") => {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? selectionRef.current.start;
    const end = textarea?.selectionEnd ?? selectionRef.current.end;
    const hasSelection = end > start;
    const selected = hasSelection ? value.slice(start, end) : "Colored text";
    const nextValue = `${value.slice(0, start)}${prefix}${selected}${suffix}${value.slice(end)}`;
    onChange(nextValue);
    requestAnimationFrame(() => {
      const nextStart = start + prefix.length;
      const nextEnd = nextStart + selected.length;
      textarea?.focus();
      textarea?.setSelectionRange(nextStart, nextEnd);
      selectionRef.current = { start: nextStart, end: nextEnd };
    });
  };
  const insertCallout = () => {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? selectionRef.current.start;
    const end = textarea?.selectionEnd ?? selectionRef.current.end;
    const selected = end > start ? value.slice(start, end) : "Replace this text with your executive template or key takeaway.";
    const callout = `> **Executive Template**\n>\n> ${selected}`;
    const nextValue = `${value.slice(0, start)}${callout}${value.slice(end)}`;
    onChange(nextValue);
    requestAnimationFrame(() => {
      const placeholderStart = start + callout.lastIndexOf(selected);
      const placeholderEnd = placeholderStart + selected.length;
      textarea?.focus();
      textarea?.setSelectionRange(placeholderStart, placeholderEnd);
      selectionRef.current = { start: placeholderStart, end: placeholderEnd };
    });
  };
  const prependLine = (prefix: string) => {
    const textarea = document.activeElement instanceof HTMLTextAreaElement ? document.activeElement : null;
    const start = textarea?.selectionStart ?? value.length;
    const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
    onChange(`${value.slice(0, lineStart)}${prefix}${value.slice(lineStart)}`);
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={onHelp} className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.12em] text-stone-500 hover:text-amber-300" aria-label="Open Markdown help">
          Markdown <HelpCircle className="h-3.5 w-3.5" />
        </button>
        <div className="flex rounded border border-[#394252] p-0.5" role="tablist" aria-label="Markdown editor mode">
          <button type="button" role="tab" aria-selected={mode === "write"} onClick={() => setMode("write")} className={`px-2 py-1 text-[10px] ${mode === "write" ? "bg-amber-500 text-slate-950" : "text-stone-400 hover:text-stone-200"}`}>Write</button>
          <button type="button" role="tab" aria-selected={mode === "preview"} onClick={() => setMode("preview")} className={`px-2 py-1 text-[10px] ${mode === "preview" ? "bg-amber-500 text-slate-950" : "text-stone-400 hover:text-stone-200"}`}>Preview</button>
        </div>
      </div>
      {mode === "write" ? (
        <>
          <div className="flex flex-wrap items-center gap-1 rounded border border-[#202631] bg-[#0c1017] p-1" role="toolbar" aria-label="Markdown formatting">
            <button type="button" onClick={() => prependLine("# ")} className="rounded px-2 py-1 text-xs font-bold text-stone-300 hover:bg-[#293343]">H1</button>
            <button type="button" onClick={() => prependLine("## ")} className="rounded px-2 py-1 text-xs font-bold text-stone-300 hover:bg-[#293343]">H2</button>
            <button type="button" onClick={() => prependLine("### ")} className="rounded px-2 py-1 text-xs font-bold text-stone-300 hover:bg-[#293343]">H3</button>
            <button type="button" onClick={() => updateSelection("**", "**")} className="rounded px-2 py-1 text-xs font-bold text-stone-300 hover:bg-[#293343]">B</button>
            <button type="button" onClick={() => updateSelection("*", "*")} className="rounded px-2 py-1 text-xs italic text-stone-300 hover:bg-[#293343]">I</button>
            <button type="button" onClick={() => prependLine("- ")} className="rounded px-2 py-1 text-xs text-stone-300 hover:bg-[#293343]">List</button>
            <button type="button" onClick={() => onChange(`${value}\n---\n`)} className="rounded px-2 py-1 text-xs text-stone-300 hover:bg-[#293343]">HR</button>
            <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={insertCallout} className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-amber-300 hover:bg-[#293343]" aria-label="Insert callout or executive template" title="Insert callout or executive template"><Lightbulb className="h-3.5 w-3.5" />Callout / Template</button>
            <span className="mx-1 h-4 w-px bg-[#394252]" aria-hidden="true" />
            <span className="sr-only">Text color</span>
            {colorPalette.map((color) => (
              <button
                key={color.value}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => updateSelection(`<span style="color: ${color.value}">`, "</span>")}
                className="h-4 w-4 rounded-full border border-white/30 transition-transform hover:scale-125 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-1 focus:ring-offset-[#0c1017]"
                style={{ backgroundColor: color.value }}
                aria-label={`Apply ${color.name} text color`}
                title={color.name}
              />
            ))}
          </div>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(event) => {
              selectionRef.current = { start: event.target.selectionStart, end: event.target.selectionEnd };
              onChange(event.target.value);
            }}
            onSelect={(event) => { selectionRef.current = { start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd }; }}
            onKeyUp={(event) => { selectionRef.current = { start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd }; }}
            onMouseUp={(event) => { selectionRef.current = { start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd }; }}
            placeholder={placeholder}
            rows={rows}
            className="min-h-[100px] w-full resize-y overflow-auto rounded border border-[#202631] bg-[#0c1017] p-2 text-xs text-stone-200 outline-none focus:border-amber-500"
            aria-label={ariaLabel}
          />
          <p className="text-[11px] leading-relaxed text-stone-500"><Lightbulb className="mr-1 inline h-3 w-3 text-amber-400" aria-hidden="true" />Tip: Wrap any word in brackets like [Micro-decisions] to automatically create a highlighted key-term badge for students.</p>
        </>
      ) : (
        <MarkdownContent value={value || "Nothing to preview yet."} className="min-h-[100px] rounded border border-[#202631] bg-[#0c1017]/50 p-3 text-sm leading-relaxed text-stone-300" />
      )}
    </div>
  );
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
        <button type="button" role="tab" aria-selected={mode === "upload"} onClick={() => setMode("upload")} className={`flex-1 px-2 py-1.5 text-[11px] font-semibold ${mode === "upload" ? "bg-amber-500 text-slate-950" : "text-stone-400 hover:text-stone-200"}`}>Upload File</button>
        <button type="button" role="tab" aria-selected={mode === "url"} onClick={() => setMode("url")} className={`flex-1 px-2 py-1.5 text-[11px] font-semibold ${mode === "url" ? "bg-amber-500 text-slate-950" : "text-stone-400 hover:text-stone-200"}`}>External URL</button>
      </div>
      {mode === "url" ? (
        <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={`Paste ${kind} URL`} disabled={disabled} className="w-full rounded border border-[#202631] bg-[#0c1017] p-2 text-xs text-stone-200 outline-none focus:border-amber-500 disabled:opacity-50" aria-label={`${kind} external URL`} />
      ) : (
        <>
          <label htmlFor={inputId} onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={(event) => { event.preventDefault(); setIsDragging(false); void handleFile(event.dataTransfer.files[0]); }} className={`flex cursor-pointer flex-col items-center justify-center rounded border border-dashed p-4 text-center transition ${isDragging ? "border-amber-400 bg-amber-500/10" : "border-[#394252] hover:border-amber-500/70"} ${disabled || isUploading ? "cursor-not-allowed opacity-60" : ""}`}>
            {isUploading ? <LoaderCircle className="mb-2 h-5 w-5 animate-spin text-amber-400" /> : <UploadCloud className="mb-2 h-5 w-5 text-amber-400" />}
            <span className="text-xs font-semibold text-stone-200">{isUploading ? "Uploading..." : `Drop ${rules.label} here or browse`}</span>
            <span className="mt-1 text-[10px] text-stone-500">{rules.description} · Max 15 MB</span>
            <input id={inputId} type="file" accept={rules.accept} className="sr-only" disabled={disabled || isUploading} onChange={(event) => void handleFile(event.target.files?.[0])} />
          </label>
          {value && <div className="flex items-center gap-3 rounded border border-emerald-500/30 bg-emerald-500/5 p-2">
            {kind === "image" ? <img src={value} alt="Uploaded media preview" className="h-14 w-20 rounded object-cover" /> : kind === "audio" ? <audio controls src={value} className="h-8 min-w-0 flex-1" /> : kind === "video" ? <video controls src={value} className="h-14 w-24 rounded object-cover" /> : <FileText className="h-8 w-8 shrink-0 text-amber-400" />}
            <span className="min-w-0 flex-1 truncate text-[11px] text-emerald-200">File uploaded</span>
            <button type="button" onClick={() => onChange("")} disabled={disabled || isUploading} className="shrink-0 text-[11px] font-semibold text-stone-400 underline hover:text-red-300 disabled:opacity-50">Remove / Replace</button>
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
  sidebarBlocksByStep = {},
}: LessonTailorEditorProps) {
  const [activeStep, setActiveStep] = useState<StudyStepId>("warm_up");
  const [draftContent, setDraftContent] = useState(content);
  const draftContentRef = useRef(content);
  const lastEmittedContentRef = useRef(JSON.stringify(content));
  const localUpdatePendingRef = useRef(false);
  const textAreaRefs = React.useRef<Record<string, HTMLTextAreaElement | null>>({});
  const [openTranscript, setOpenTranscript] = useState<Record<string, boolean>>({});
  const [openTranscriptPreview, setOpenTranscriptPreview] = useState<Record<string, boolean>>({});
  const [collapsedBlocks, setCollapsedBlocks] = useState<Record<string, boolean>>({});
  const [markdownHelpBlock, setMarkdownHelpBlock] = useState<string | null>(null);
  const transcriptWrapRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
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
    return { ...base, type: "quiz", title: "Task / Quiz", questions: [{ id: `${id}-q1`, prompt: "", options: ["", "", ""], correct_answer: "" }] };
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

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      for (const [blockId, element] of transcriptWrapRefs.current.entries()) {
        if (!openTranscript[blockId] || !element) continue;
        if (!element.contains(target)) {
          setOpenTranscript((current) => ({ ...current, [blockId]: false }));
        }
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [openTranscript]);

  const renderTranscriptField = (step: StudyStepId, index: number, block: ContentBlock & { transcript?: string }) => {
    const isOpen = !!openTranscript[block.id];
    const preview = (block.transcript || "").trim();
    return (
      <div
        ref={(element) => {
          if (element) transcriptWrapRefs.current.set(block.id, element);
          else transcriptWrapRefs.current.delete(block.id);
        }}
        className="rounded border border-[#202631] bg-[#0c1017]/50"
      >
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setOpenTranscript((current) => ({ ...current, [block.id]: !current[block.id] }));
          }}
          aria-expanded={isOpen}
          aria-controls={`transcript-${block.id}`}
          className="flex w-full items-center justify-between px-2 py-1.5 text-left text-xs text-stone-400 hover:text-amber-300"
        >
          <span className="text-[11px] font-medium uppercase tracking-[0.08em]">Transcript{preview ? ` · ${preview.length} chars` : " (optional)"}</span>
          <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${isOpen ? "rotate-180 text-amber-400" : ""}`} />
        </button>
        {!isOpen && preview ? <MarkdownContent value={preview} className="line-clamp-2 px-2 pb-1.5 text-[11px] leading-relaxed text-stone-500" /> : null}
        {isOpen && (
          <div id={`transcript-${block.id}`} className="border-t border-[#202631] p-2">
            <MarkdownEditor value={block.transcript || ""} onChange={(value) => updateDynamicBlock(step, index, { transcript: value })} onHelp={() => setMarkdownHelpBlock(block.id)} placeholder="Paste script or audio/video transcript here..." ariaLabel="Media Transcript (Optional)" />
          </div>
        )}
      </div>
    );
  };

  const applyMarkdown = (step: StudyStepId, index: number, prefix: string, suffix = "") => {
    const block = getBlocks(step)[index];
    if (!block || block.type !== "text") return;
    const textarea = textAreaRefs.current[block.id];
    const value = block.body;
    const start = textarea?.selectionStart ?? value.length;
    const end = textarea?.selectionEnd ?? value.length;
    const selected = value.slice(start, end) || "text";
    const nextValue = `${value.slice(0, start)}${prefix}${selected}${suffix}${value.slice(end)}`;
    updateDynamicBlock(step, index, { body: nextValue });
    requestAnimationFrame(() => {
      const nextStart = start + prefix.length;
      const nextEnd = nextStart + selected.length;
      textarea?.focus();
      textarea?.setSelectionRange(nextStart, nextEnd);
    });
  };

  const prependMarkdownLine = (step: StudyStepId, index: number, prefix: string) => {
    const block = getBlocks(step)[index];
    if (!block || block.type !== "text") return;
    const textarea = textAreaRefs.current[block.id];
    const value = block.body;
    const start = textarea?.selectionStart ?? value.length;
    const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
    const nextValue = `${value.slice(0, lineStart)}${prefix}${value.slice(lineStart)}`;
    updateDynamicBlock(step, index, { body: nextValue });
    requestAnimationFrame(() => textarea?.focus());
  };

  const insertMarkdownSnippet = (step: StudyStepId, index: number, snippet: string) => {
    const block = getBlocks(step)[index];
    if (!block || block.type !== "text") return;
    const textarea = textAreaRefs.current[block.id];
    const value = block.body;
    const start = textarea?.selectionStart ?? value.length;
    const end = textarea?.selectionEnd ?? value.length;
    const nextValue = `${value.slice(0, start)}${snippet}${value.slice(end)}`;
    updateDynamicBlock(step, index, { body: nextValue });
    requestAnimationFrame(() => {
      textarea?.focus();
      const cursor = start + snippet.length;
      textarea?.setSelectionRange(cursor, cursor);
    });
  };

  const renderDynamicBuilder = (step: StudyStepId) => {
    const blocks = getBlocks(step);
    const toggleBlockCollapse = (blockId: string) => {
      setCollapsedBlocks((current) => ({ ...current, [blockId]: !current[blockId] }));
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
      transcriptWrapRefs.current.delete(blockId);
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
      <div className="space-y-3 rounded-lg border border-amber-500/20 bg-[#0c1017]/70 p-3">
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
            className="rounded-md border border-amber-500 bg-[#0c1017] px-3 py-2 text-sm font-medium text-amber-500 [color-scheme:dark] outline-none transition hover:bg-amber-500/10 focus:border-amber-500"
          >
            <option value="" className="bg-slate-900 text-slate-100">+ Add Content Block</option>
            <option value="text" className="bg-slate-900 text-slate-100">Text Block</option>
            <option value="audio" className="bg-slate-900 text-slate-100">Audio Block</option>
            <option value="video" className="bg-slate-900 text-slate-100">Video Block</option>
            <option value="image" className="bg-slate-900 text-slate-100">Image Block</option>
            <option value="resource" className="bg-slate-900 text-slate-100">Resource / Document Block</option>
            <option value="question" className="bg-slate-900 text-slate-100">Question Block</option>
            <option value="quiz" className="bg-slate-900 text-slate-100">Quiz Block</option>
          </select>
        </div>

        {blocks.length === 0 && <p className="py-3 text-xs text-stone-500">No content blocks yet. Add a block to begin building this step.</p>}
        {blocks.map((block, index) => {
          const isExpanded = !collapsedBlocks[block.id];
          const isActive = block.is_active ?? block.enabled !== false;
          return (
          <div key={block.id} className={`rounded-md border border-[#202631] bg-[#171d28] p-3 transition-opacity ${isActive ? "opacity-100" : "opacity-55"}`}>
            <div className="mb-3 flex cursor-pointer items-center justify-between gap-2" onClick={() => toggleBlockCollapse(block.id)}>
              <button type="button" onClick={(event) => { event.stopPropagation(); toggleBlockCollapse(block.id); }} className="flex min-w-0 items-center gap-2 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-400 hover:text-amber-300" aria-expanded={isExpanded} aria-controls={`block-content-${block.id}`}>
                {isExpanded ? <ChevronUp className="h-3.5 w-3.5 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0" />}
                <span className="truncate">{index + 1}. {block.type} block{!isActive ? " · Inactive" : ""}</span>
              </button>
              <div className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
                <button type="button" onClick={() => updateDynamicBlock(step, index, { is_active: !isActive, enabled: !isActive })} role="switch" aria-checked={isActive} className={`mr-1 inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold transition ${isActive ? "border-emerald-500/50 text-emerald-300" : "border-[#394252] text-stone-500"}`}>
                  <span className={`h-2 w-2 rounded-full ${isActive ? "bg-emerald-400" : "bg-stone-600"}`} />{isActive ? "Active" : "Inactive"}
                </button>
                <button type="button" onClick={() => moveBlock(index, -1)} disabled={index === 0} className="rounded p-1 text-stone-400 hover:bg-[#0c1017] hover:text-amber-300 disabled:opacity-30" aria-label="Move block up"><MoveUp className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => moveBlock(index, 1)} disabled={index === blocks.length - 1} className="rounded p-1 text-stone-400 hover:bg-[#0c1017] hover:text-amber-300 disabled:opacity-30" aria-label="Move block down"><MoveDown className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => handleDeleteBlock(index, block.id)} className="rounded p-1 text-stone-400 hover:bg-[#0c1017] hover:text-red-300" aria-label="Delete block"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
            <div id={`block-content-${block.id}`} className={`overflow-hidden transition-[max-height,opacity] duration-200 ${isExpanded ? "max-h-[5000px] opacity-100" : "max-h-0 opacity-0"}`} aria-hidden={!isExpanded}>
            <input value={block.title} onChange={(event) => updateDynamicBlock(step, index, { title: event.target.value })} placeholder="Block title" className="mb-2 w-full rounded border border-[#202631] bg-[#0c1017] p-2 text-xs text-stone-200 outline-none focus:border-amber-500" aria-label={`${block.type} block title`} />
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
              <MarkdownEditor value={block.body} onChange={(value) => updateDynamicBlock(step, index, { body: value })} onHelp={() => setMarkdownHelpBlock(block.id)} placeholder="Main body content" ariaLabel="Text block body" />
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
                      <button type="button" onClick={() => void startRecording(block.id, step, index)} disabled={isUploading} className="inline-flex items-center gap-1.5 rounded-md border border-amber-500 px-2.5 py-1.5 text-xs font-semibold text-amber-500 transition hover:bg-amber-500 hover:text-black disabled:opacity-40" aria-label="Record voice for audio block"><Mic className="h-3.5 w-3.5" />{isUploading ? "Uploading…" : "Record voice"}</button>
                    ) : (
                      <div className="flex w-full flex-row items-center gap-3 rounded-lg border border-red-500/30 bg-[#0c1017] px-3 py-1.5">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500 animate-pulse" aria-hidden />
                        <span className="text-xs font-mono tabular-nums text-red-300">{fmt(rec?.elapsed||0)}</span>
                        <div className="flex items-end gap-[2px] h-6" aria-hidden>{(rec?.levels||Array(18).fill(5)).map((h,i)=><span key={i} className="w-[3px] rounded-full bg-amber-400/80" style={{height:h}} />)}</div>
                        <button type="button" onClick={() => stopRecording(block.id)} className="inline-flex items-center gap-1.5 rounded-md bg-red-500 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-red-400"><Square className="h-3 w-3 fill-current" />Stop & save</button>
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
            {block.type === "video" && <div className="space-y-2"><MediaAssetInput kind="video" value={block.videoUrl} onChange={(value) => updateDynamicBlock(step, index, { videoUrl: value })} /><label className="flex cursor-pointer items-start gap-3 rounded border border-[#202631] bg-[#0c1017]/60 p-3"><input type="checkbox" checked={block.show_reflection_prompt !== false} onChange={(event) => updateDynamicBlock(step, index, { show_reflection_prompt: event.target.checked })} className="mt-0.5 h-4 w-4 shrink-0 accent-amber-500" /><span className="text-xs font-semibold text-stone-200">Include Reflection Question below video</span></label>{block.show_reflection_prompt !== false && <input value={block.reflection_prompt_text || ""} onChange={(event) => updateDynamicBlock(step, index, { reflection_prompt_text: event.target.value })} placeholder="Think of an everyday product or app you use that frustrates you..." className="w-full rounded border border-[#202631] bg-[#0c1017] p-2 text-xs text-stone-200 outline-none focus:border-amber-500" aria-label="Reflection question" /> }<InteractiveVideoBlock videoUrl={block.videoUrl} title={block.title || "Lesson video"} transcript={block.transcript} editable onTranscriptChange={(value) => updateDynamicBlock(step, index, { transcript: value })} /></div>}
            {block.type === "image" && <div className="space-y-2"><MediaAssetInput kind="image" value={block.imageUrl} onChange={(value) => updateDynamicBlock(step, index, { imageUrl: value })} /><input value={block.caption} onChange={(event) => updateDynamicBlock(step, index, { caption: event.target.value })} placeholder="Image caption" className="w-full rounded border border-[#202631] bg-[#0c1017] p-2 text-xs text-stone-200 outline-none focus:border-amber-500" aria-label="Image block caption" /></div>}
            {block.type === "resource" && <div className="space-y-2"><MediaAssetInput kind="resource" value={block.resourceUrl} onChange={(value) => updateDynamicBlock(step, index, { resourceUrl: value })} /><input value={block.description || ""} onChange={(event) => updateDynamicBlock(step, index, { description: event.target.value })} placeholder="Document description" className="w-full rounded border border-[#202631] bg-[#0c1017] p-2 text-xs text-stone-200 outline-none focus:border-amber-500" aria-label="Document description" /></div>}
            {block.type === "question" && <div className="space-y-2"><label className="block text-xs text-stone-500">Question type<select value={block.question_type || "multiple_choice"} onChange={(event) => updateDynamicBlock(step, index, { question_type: event.target.value as "multiple_choice" | "open_ended" })} className="mt-1 w-full rounded border border-[#202631] bg-[#0c1017] p-2 text-xs text-stone-200 [color-scheme:dark]" aria-label="Question type"><option value="multiple_choice">Multiple Choice</option><option value="open_ended">Open-Ended Response</option></select></label><MarkdownEditor value={block.prompt} onChange={(value) => updateDynamicBlock(step, index, { prompt: value })} onHelp={() => setMarkdownHelpBlock(block.id)} placeholder="Question or task prompt" ariaLabel="Question or task prompt" rows={4} />{(block.question_type || "multiple_choice") === "open_ended" ? <MarkdownEditor value={block.sample_answer || ""} onChange={(value) => updateDynamicBlock(step, index, { sample_answer: value })} onHelp={() => setMarkdownHelpBlock(block.id)} placeholder="Optional model answer or evaluation guide" ariaLabel="Sample answer or instructor guide" rows={4} /> : <>{block.options.map((option, optionIndex) => <div key={`${block.id}-${optionIndex}`} className="flex gap-2"><input value={option} onChange={(event) => updateDynamicBlock(step, index, { options: block.options.map((value, valueIndex) => valueIndex === optionIndex ? event.target.value : value) })} placeholder={`Option ${optionIndex + 1} (optional)`} className="min-w-0 flex-1 rounded border border-[#202631] bg-[#0c1017] p-2 text-xs text-stone-200 outline-none focus:border-amber-500" aria-label={`Question option ${optionIndex + 1}`} /><button type="button" onClick={() => updateDynamicBlock(step, index, { options: block.options.filter((_, valueIndex) => valueIndex !== optionIndex) })} disabled={block.options.length <= 1} aria-label={`Remove question option ${optionIndex + 1}`} className="rounded border border-[#394252] px-2 text-stone-500 hover:border-red-400 hover:text-red-300 disabled:opacity-30"><X className="h-3.5 w-3.5" /></button></div>)}<button type="button" onClick={() => updateDynamicBlock(step, index, { options: [...block.options, ""] })} className="flex items-center gap-1 text-xs text-amber-300 hover:text-amber-200"><Plus className="h-3 w-3" /> Add option</button><input value={block.correct_answer} onChange={(event) => updateDynamicBlock(step, index, { correct_answer: event.target.value })} placeholder="Correct Answer / Key" className="w-full rounded border border-amber-500/30 bg-[#0c1017] p-2 text-xs text-stone-200 outline-none focus:border-amber-500" aria-label="Correct Answer / Key" /></>}</div>}
            {block.type === "quiz" && <div className="space-y-2"><div className="flex items-center justify-between text-xs text-stone-400"><span>Questions</span><button type="button" onClick={() => updateDynamicBlock(step, index, { questions: [...block.questions, { id: `${block.id}-q${block.questions.length + 1}`, prompt: "", options: ["", "", ""], correct_answer: "" }] })} className="flex items-center gap-1 text-amber-300 hover:text-amber-200"><Plus className="h-3 w-3" /> Add question</button></div>{block.questions.map((question, questionIndex) => <div key={question.id} className="space-y-2 rounded border border-[#202631] bg-[#0c1017] p-2"><input value={question.prompt} onChange={(event) => updateDynamicBlock(step, index, { questions: block.questions.map((item, itemIndex) => itemIndex === questionIndex ? { ...item, prompt: event.target.value } : item) })} placeholder={`Question ${questionIndex + 1}`} className="w-full rounded border border-[#202631] bg-[#171d28] p-2 text-xs text-stone-200 outline-none focus:border-amber-500" aria-label={`Quiz question ${questionIndex + 1}`} /><MarkdownContent value={question.prompt || "Question preview"} className="text-xs text-stone-300" /><button type="button" onClick={() => updateDynamicBlock(step, index, { questions: block.questions.map((item, itemIndex) => itemIndex === questionIndex ? { ...item, options: [...item.options, ""] } : item) })} className="flex items-center gap-1 text-amber-300 hover:text-amber-200"><Plus className="h-3 w-3" /> Add option</button>{question.options.map((option, optionIndex) => <input key={`${question.id}-${optionIndex}`} value={option} onChange={(event) => updateDynamicBlock(step, index, { questions: block.questions.map((item, itemIndex) => itemIndex === questionIndex ? { ...item, options: item.options.map((value, valueIndex) => valueIndex === optionIndex ? event.target.value : value) } : item) })} placeholder={`Option ${optionIndex + 1}`} className="w-full rounded border border-[#202631] bg-[#171d28] p-2 text-xs text-stone-200 outline-none focus:border-amber-500" aria-label={`Quiz question ${questionIndex + 1} option ${optionIndex + 1}`} />)}<input value={question.correct_answer || question.correctAnswer || ""} onChange={(event) => updateDynamicBlock(step, index, { questions: block.questions.map((item, itemIndex) => itemIndex === questionIndex ? { ...item, correct_answer: event.target.value } : item) })} placeholder="Correct Answer / Key" className="w-full rounded border border-amber-500/30 bg-[#171d28] p-2 text-xs text-stone-200 outline-none focus:border-amber-500" aria-label={`Quiz question ${questionIndex + 1} Correct Answer / Key`} /></div>)}</div>}
            </div>
          </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="bg-[#171d28]/60 border border-[#202631] rounded-xl p-5 text-[#d9dce0]">
      <div className="flex items-center justify-between mb-4 border-b border-[#202631] pb-3">
        <h2 className="font-sans text-xl font-semibold flex items-center gap-2">
          <Layers className="w-5 h-5 text-amber-400" />
          Lesson Content Tailor
        </h2>
        {onPreview && (
          <button
            onClick={onPreview}
            className="flex items-center gap-1.5 text-xs text-stone-300 hover:text-white bg-[#0c1017] px-3 py-1.5 rounded-lg border border-[#202631] transition"
          >
            <Eye className="w-3.5 h-3.5" /> Preview Student View
          </button>
        )}
      </div>

      {/* Stepper Tabs */}
      <nav aria-label="Lesson content steps" className="w-full mb-6">
      <div className="flex w-full items-center justify-between gap-2 overflow-x-auto scrollbar-none sm:gap-3">
        {STUDY_STEPS.filter((step) => step.id !== "results").map((step) => {
          const isActive = activeStep === step.id;
          return (
            <button
              key={step.id}
              onClick={() => setActiveStep(step.id)}
              className={`group flex shrink-0 items-center gap-2 rounded-none border-0 px-0 py-1 text-[12px] font-medium leading-none transition-all duration-200 ease-out whitespace-nowrap ${
                isActive
                  ? "text-amber-400"
                  : "text-[#545d70] hover:text-[#858d9c]"
              }`}
            >
              <span className={`flex h-[18px] w-[18px] items-center justify-center rounded-full text-[10px] font-semibold transition-all ${
                isActive
                  ? "border border-amber-500 bg-amber-500 text-[#12161d]"
                  : "border border-[#293343] bg-transparent text-transparent"
              }`}>
                {isActive ? step.stepNumber : <span>{step.stepNumber}</span>}
              </span>
              {step.label}
            </button>
          );
        })}
      </div>
      </nav>

      {/* Block Content Editor */}
      <div className="space-y-4">
        {renderDynamicBuilder(activeStep)}

      </div>
      {markdownHelpBlock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="markdown-help-title" onMouseDown={(event) => { if (event.target === event.currentTarget) setMarkdownHelpBlock(null); }}>
          <div className="w-full max-w-md rounded-lg border border-[#394252] bg-[#171d28] p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-[#293343] pb-3">
              <h3 id="markdown-help-title" className="text-sm font-semibold text-stone-100">Markdown quick guide</h3>
              <button type="button" onClick={() => setMarkdownHelpBlock(null)} className="rounded p-1 text-stone-400 hover:bg-[#0c1017] hover:text-stone-100" aria-label="Close Markdown help"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-4 text-xs text-stone-300">
              <code># Heading 1</code><code>## Heading 2</code><code>### Heading 3</code><code>- Nested list item</code><code>**bold** and *italic*</code><code>&gt; Blockquote</code><code>---</code><code>`inline code`</code>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default LessonTailorEditor;
