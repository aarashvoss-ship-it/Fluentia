"use client";

import React, { useEffect, useRef, useState } from "react";
import { ContentBlock, ContentBlockType, STUDY_STEPS, StudyStepId, StrictStepContent } from "@/types/lesson";
import { useLessonEditorStore } from "@/lib/lesson-editor-store";
import { CustomAudioPlayer } from "@/components/study-room/custom-audio-player";
import { InteractiveVideoBlock } from "@/components/shared/interactive-video-block";
import { MarkdownContent } from "@/components/study-room/markdown-content";
import { uploadLessonMedia } from "@/services/storage-service";
import { Eye, Layers, MoveDown, MoveUp, Plus, Trash2, X, ChevronDown, Mic, Square } from "lucide-react";

interface LessonTailorEditorProps {
  content: StrictStepContent;
  onChange?: (updatedContent: StrictStepContent) => void;
  onPreview?: () => void;
}

export function LessonTailorEditor({
  content,
  onChange,
  onPreview,
}: LessonTailorEditorProps) {
  const [activeStep, setActiveStep] = useState<StudyStepId>("warm_up");
  const textAreaRefs = React.useRef<Record<string, HTMLTextAreaElement | null>>({});
  const [openTranscript, setOpenTranscript] = useState<Record<string, boolean>>({});
  const [openMarkdownGuide, setOpenMarkdownGuide] = useState<Record<string, boolean>>({});
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
    toggleBlock: storeToggleBlock,
    reorderBlocks,
  } = useLessonEditorStore();

  // Wrapper to handle both local state and Supabase sync
  const handleChange = async (updatedContent: StrictStepContent) => {
    if (onChange) {
      onChange(updatedContent);
    }
  };

  const updateStepValue = (step: StudyStepId, field: string, value: unknown) => {
    handleChange({
      ...content,
      [step]: {
        ...(content[step] || {}),
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
    (((content[step] || {}) as { blocks?: ContentBlock[] }).blocks || []);

  const updateBlocks = (step: StudyStepId, blocks: ContentBlock[]) => updateStepValue(step, "blocks", blocks);

  const createBlock = (type: ContentBlockType): ContentBlock => {
    const id = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    if (type === "text") return { id, type, title: "Text block", body: "", enabled: true };
    if (type === "audio") return { id, type, title: "Audio lesson", audioUrl: "", transcript: "", enabled: true };
    if (type === "video") return { id, type, title: "Video lesson", videoUrl: "", transcript: "", enabled: true };
    if (type === "image") return { id, type, title: "Image", imageUrl: "", caption: "", enabled: true };
    if (type === "question") return { id, type, title: "Question", prompt: "", options: ["", "", ""], correct_answer: "", enabled: true };
    return { id, type, title: "Task / Quiz", questions: [{ id: `${id}-q1`, prompt: "", options: ["", "", ""], correct_answer: "" }], enabled: true };
  };

  const updateDynamicBlock = (step: StudyStepId, index: number, patch: Partial<ContentBlock>) => {
    const blocks = getBlocks(step).map((block, blockIndex) => blockIndex === index ? { ...block, ...patch } as ContentBlock : block);
    updateBlocks(step, blocks);
    
    // Sync to Supabase
    const block = blocks[index];
    if (block) {
      updateBlock(step, block.id, patch).catch((error: any) => {
        console.error("Failed to update block:", error);
      });
    }
  };

  const handleAudioUpload = async (step: StudyStepId, index: number, file?: File) => {
    if (!file) return;
    try {
      const asset = await uploadLessonMedia(file, `lesson-${step}-${Date.now()}`);
      updateDynamicBlock(step, index, { audioUrl: asset.url });
    } catch (error) {
      console.error("Lesson audio upload failed:", error);
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
        {!isOpen && preview ? <p className="px-2 pb-1.5 text-[11px] leading-relaxed text-stone-500 line-clamp-2">{preview}</p> : null}
        {isOpen && (
          <div id={`transcript-${block.id}`} className="border-t border-[#202631] p-2">
            <textarea
              value={block.transcript || ""}
              onChange={(event) => updateDynamicBlock(step, index, { transcript: event.target.value })}
              placeholder="Paste script or audio/video transcript here..."
              rows={4}
              className="max-h-48 w-full resize-y overflow-auto rounded border border-[#202631] bg-[#0c1017] p-2 text-xs text-stone-200 outline-none focus:border-amber-500"
              aria-label="Media Transcript (Optional)"
            />
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
            <option value="question" className="bg-slate-900 text-slate-100">Question Block</option>
            <option value="quiz" className="bg-slate-900 text-slate-100">Quiz Block</option>
          </select>
        </div>

        {blocks.length === 0 && <p className="py-3 text-xs text-stone-500">No content blocks yet. Add a block to begin building this step.</p>}
        {blocks.map((block, index) => (
          <div key={block.id} className="rounded-md border border-[#202631] bg-[#171d28] p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-400">{index + 1}. {block.type} block</span>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => moveBlock(index, -1)} disabled={index === 0} className="rounded p-1 text-stone-400 hover:bg-[#0c1017] hover:text-amber-300 disabled:opacity-30" aria-label="Move block up"><MoveUp className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => moveBlock(index, 1)} disabled={index === blocks.length - 1} className="rounded p-1 text-stone-400 hover:bg-[#0c1017] hover:text-amber-300 disabled:opacity-30" aria-label="Move block down"><MoveDown className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => handleDeleteBlock(index, block.id)} className="rounded p-1 text-stone-400 hover:bg-[#0c1017] hover:text-red-300" aria-label="Delete block"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
            <input value={block.title} onChange={(event) => updateDynamicBlock(step, index, { title: event.target.value })} placeholder="Block title" className="mb-2 w-full rounded border border-[#202631] bg-[#0c1017] p-2 text-xs text-stone-200 outline-none focus:border-amber-500" aria-label={`${block.type} block title`} />
            {block.type === "text" && <div className="space-y-2"><details open={!!openMarkdownGuide[block.id]} onToggle={(event) => setOpenMarkdownGuide((current) => ({ ...current, [block.id]: event.currentTarget.open }))} className="rounded border border-[#202631] bg-[#0c1017]/70"><summary className="cursor-pointer list-none px-2 py-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-stone-400 hover:text-amber-300">Markdown Guide / Cheat Sheet</summary><div className="border-t border-[#202631] p-2"><p className="mb-2 text-[11px] text-stone-500">Use Markdown for structure, emphasis, quotes, code, lists, and formulas.</p><div className="flex flex-wrap gap-1.5"><button type="button" onClick={() => insertMarkdownSnippet(step, index, "# Heading 1\n")} className="rounded border border-[#394252] px-2 py-1 font-mono text-[11px] text-stone-300 hover:border-amber-500 hover:text-amber-300"># Heading 1</button><button type="button" onClick={() => insertMarkdownSnippet(step, index, "## Heading 2\n")} className="rounded border border-[#394252] px-2 py-1 font-mono text-[11px] text-stone-300 hover:border-amber-500 hover:text-amber-300">## Heading 2</button><button type="button" onClick={() => insertMarkdownSnippet(step, index, "**Bold**")} className="rounded border border-[#394252] px-2 py-1 font-mono text-[11px] text-stone-300 hover:border-amber-500 hover:text-amber-300">**Bold**</button><button type="button" onClick={() => insertMarkdownSnippet(step, index, "*Italic*")} className="rounded border border-[#394252] px-2 py-1 font-mono text-[11px] text-stone-300 hover:border-amber-500 hover:text-amber-300">*Italic*</button><button type="button" onClick={() => insertMarkdownSnippet(step, index, "- Bullet list\n")} className="rounded border border-[#394252] px-2 py-1 font-mono text-[11px] text-stone-300 hover:border-amber-500 hover:text-amber-300">- Bullet list</button><button type="button" onClick={() => insertMarkdownSnippet(step, index, "> Blockquote / Key Insight\n")} className="rounded border border-[#394252] px-2 py-1 font-mono text-[11px] text-stone-300 hover:border-amber-500 hover:text-amber-300">&gt; Blockquote</button><button type="button" onClick={() => insertMarkdownSnippet(step, index, "`code`")} className="rounded border border-[#394252] px-2 py-1 font-mono text-[11px] text-stone-300 hover:border-amber-500 hover:text-amber-300">`code`</button><button type="button" onClick={() => insertMarkdownSnippet(step, index, "$math$")} className="rounded border border-[#394252] px-2 py-1 font-mono text-[11px] text-stone-300 hover:border-amber-500 hover:text-amber-300">$math$</button><button type="button" onClick={() => insertMarkdownSnippet(step, index, "1.01^365")} className="rounded border border-[#394252] px-2 py-1 font-mono text-[11px] text-stone-300 hover:border-amber-500 hover:text-amber-300">1.01^365</button></div></div></details><div className="flex flex-wrap items-center gap-1 rounded border border-[#202631] bg-[#0c1017] p-1" role="toolbar" aria-label="Text formatting"><button type="button" onClick={() => prependMarkdownLine(step, index, "# ")} className="rounded px-2 py-1 text-xs font-bold text-stone-300 hover:bg-[#293343]" aria-label="Heading 1">H1</button><button type="button" onClick={() => prependMarkdownLine(step, index, "## ")} className="rounded px-2 py-1 text-xs font-bold text-stone-300 hover:bg-[#293343]" aria-label="Heading 2">H2</button><button type="button" onClick={() => applyMarkdown(step, index, "**", "**")} className="rounded px-2 py-1 text-xs font-bold text-stone-300 hover:bg-[#293343]" aria-label="Bold">B</button><button type="button" onClick={() => applyMarkdown(step, index, "*", "*")} className="rounded px-2 py-1 text-xs italic text-stone-300 hover:bg-[#293343]" aria-label="Italic">I</button><button type="button" onClick={() => prependMarkdownLine(step, index, "- ")} className="rounded px-2 py-1 text-xs text-stone-300 hover:bg-[#293343]" aria-label="Bullet list">- List</button></div><textarea ref={(element) => { textAreaRefs.current[block.id] = element; }} value={block.body} onChange={(event) => updateDynamicBlock(step, index, { body: event.target.value })} placeholder="Main body content" rows={4} className="w-full resize-y rounded border border-[#202631] bg-[#0c1017] p-2 text-xs text-stone-200 outline-none focus:border-amber-500" aria-label="Text block body" /><div className="rounded border border-[#202631] bg-[#0c1017]/50 p-3"><p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-400">Live Preview</p><MarkdownContent value={block.body || "Start typing to preview your text block."} className="text-sm leading-relaxed text-stone-300" /></div></div>}
            {block.type === "audio" && (() => {
              const rec = recordingByBlockId[block.id];
              const isRecording = rec?.status === "recording";
              const isUploading = rec?.status === "uploading";
              return (
                <div className="space-y-2">
                  <input value={block.audioUrl.startsWith("data:") ? "" : block.audioUrl} onChange={(event) => updateDynamicBlock(step, index, { audioUrl: event.target.value })} placeholder="Audio URL" disabled={isRecording || isUploading} className="w-full rounded border border-[#202631] bg-[#0c1017] p-2 text-xs text-stone-200 outline-none focus:border-amber-500 disabled:opacity-50" aria-label="Audio block URL" />
                  <label className="block text-xs text-stone-500">Or upload MP3/WAV<input type="file" accept="audio/mpeg,audio/wav,.mp3,.wav" onChange={(event) => void handleAudioUpload(step, index, event.target.files?.[0])} disabled={isRecording || isUploading} className="mt-1 block w-full text-xs text-stone-400 file:mr-3 file:rounded file:border-0 file:bg-amber-500 file:px-2 file:py-1 file:text-xs file:font-semibold file:text-black disabled:opacity-50" aria-label="Upload audio file" /></label>
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
            {block.type === "video" && <div className="space-y-2"><input value={block.videoUrl} onChange={(event) => updateDynamicBlock(step, index, { videoUrl: event.target.value })} placeholder="YouTube or video embed URL" className="w-full rounded border border-[#202631] bg-[#0c1017] p-2 text-xs text-stone-200 outline-none focus:border-amber-500" aria-label="Video block URL" /><InteractiveVideoBlock videoUrl={block.videoUrl} title={block.title || "Lesson video"} transcript={block.transcript} editable onTranscriptChange={(value) => updateDynamicBlock(step, index, { transcript: value })} /></div>}
            {block.type === "image" && <div className="space-y-2"><input value={block.imageUrl} onChange={(event) => updateDynamicBlock(step, index, { imageUrl: event.target.value })} placeholder="Image URL" className="w-full rounded border border-[#202631] bg-[#0c1017] p-2 text-xs text-stone-200 outline-none focus:border-amber-500" aria-label="Image block URL" /><input value={block.caption} onChange={(event) => updateDynamicBlock(step, index, { caption: event.target.value })} placeholder="Image caption" className="w-full rounded border border-[#202631] bg-[#0c1017] p-2 text-xs text-stone-200 outline-none focus:border-amber-500" aria-label="Image block caption" /></div>}
            {block.type === "question" && <div className="space-y-2"><textarea value={block.prompt} onChange={(event) => updateDynamicBlock(step, index, { prompt: event.target.value })} placeholder="Question or task prompt" rows={3} className="w-full resize-none rounded border border-[#202631] bg-[#0c1017] p-2 text-xs text-stone-200 outline-none focus:border-amber-500" aria-label="Question or task prompt" />{block.options.map((option, optionIndex) => <div key={`${block.id}-${optionIndex}`} className="flex gap-2"><input value={option} onChange={(event) => updateDynamicBlock(step, index, { options: block.options.map((value, valueIndex) => valueIndex === optionIndex ? event.target.value : value) })} placeholder={`Option ${optionIndex + 1} (optional)`} className="min-w-0 flex-1 rounded border border-[#202631] bg-[#0c1017] p-2 text-xs text-stone-200 outline-none focus:border-amber-500" aria-label={`Question option ${optionIndex + 1}`} /><button type="button" onClick={() => updateDynamicBlock(step, index, { options: block.options.filter((_, valueIndex) => valueIndex !== optionIndex) })} disabled={block.options.length <= 1} aria-label={`Remove question option ${optionIndex + 1}`} className="rounded border border-[#394252] px-2 text-stone-500 hover:border-red-400 hover:text-red-300 disabled:opacity-30"><X className="h-3.5 w-3.5" /></button></div>)}<button type="button" onClick={() => updateDynamicBlock(step, index, { options: [...block.options, ""] })} className="flex items-center gap-1 text-xs text-amber-300 hover:text-amber-200"><Plus className="h-3 w-3" /> Add option</button><input value={block.correct_answer} onChange={(event) => updateDynamicBlock(step, index, { correct_answer: event.target.value })} placeholder="Correct Answer / Key" className="w-full rounded border border-amber-500/30 bg-[#0c1017] p-2 text-xs text-stone-200 outline-none focus:border-amber-500" aria-label="Correct Answer / Key" /></div>}
            {block.type === "quiz" && <div className="space-y-2"><div className="flex items-center justify-between text-xs text-stone-400"><span>Questions</span><button type="button" onClick={() => updateDynamicBlock(step, index, { questions: [...block.questions, { id: `${block.id}-q${block.questions.length + 1}`, prompt: "", options: ["", "", ""], correct_answer: "" }] })} className="flex items-center gap-1 text-amber-300 hover:text-amber-200"><Plus className="h-3 w-3" /> Add question</button></div>{block.questions.map((question, questionIndex) => <div key={question.id} className="space-y-2 rounded border border-[#202631] bg-[#0c1017] p-2"><input value={question.prompt} onChange={(event) => updateDynamicBlock(step, index, { questions: block.questions.map((item, itemIndex) => itemIndex === questionIndex ? { ...item, prompt: event.target.value } : item) })} placeholder={`Question ${questionIndex + 1}`} className="w-full rounded border border-[#202631] bg-[#171d28] p-2 text-xs text-stone-200 outline-none focus:border-amber-500" aria-label={`Quiz question ${questionIndex + 1}`} />{question.options.map((option, optionIndex) => <input key={`${question.id}-${optionIndex}`} value={option} onChange={(event) => updateDynamicBlock(step, index, { questions: block.questions.map((item, itemIndex) => itemIndex === questionIndex ? { ...item, options: item.options.map((value, valueIndex) => valueIndex === optionIndex ? event.target.value : value) } : item) })} placeholder={`Option ${optionIndex + 1}`} className="w-full rounded border border-[#202631] bg-[#171d28] p-2 text-xs text-stone-200 outline-none focus:border-amber-500" aria-label={`Quiz question ${questionIndex + 1} option ${optionIndex + 1}`} />)}<input value={question.correct_answer || question.correctAnswer || ""} onChange={(event) => updateDynamicBlock(step, index, { questions: block.questions.map((item, itemIndex) => itemIndex === questionIndex ? { ...item, correct_answer: event.target.value } : item) })} placeholder="Correct Answer / Key" className="w-full rounded border border-amber-500/30 bg-[#171d28] p-2 text-xs text-stone-200 outline-none focus:border-amber-500" aria-label={`Quiz question ${questionIndex + 1} Correct Answer / Key`} /></div>)}</div>}
          </div>
        ))}
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
    </div>
  );
}

export default LessonTailorEditor;
