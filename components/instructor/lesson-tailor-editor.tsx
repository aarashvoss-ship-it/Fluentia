"use client";

import React, { useState } from "react";
import { ContentBlock, ContentBlockType, STUDY_STEPS, StudyStepId, StrictStepContent } from "@/types/lesson";
import { useLessonEditorStore } from "@/lib/lesson-editor-store";
import { ToggleLeft, ToggleRight, Eye, Layers, MoveDown, MoveUp, Plus, Trash2 } from "lucide-react";

interface LessonTailorEditorProps {
  content: StrictStepContent;
  onChange?: (updatedContent: StrictStepContent) => void;
  onPreview?: () => void;
}

const getVideoEmbedUrl = (url: string) => {
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.hostname === "youtu.be") {
      return `https://www.youtube.com/embed/${parsedUrl.pathname.slice(1)}`;
    }
    if (parsedUrl.hostname.endsWith("youtube.com") && parsedUrl.pathname === "/watch") {
      const videoId = parsedUrl.searchParams.get("v");
      return videoId ? `https://www.youtube.com/embed/${videoId}` : "";
    }
    if (parsedUrl.hostname.endsWith("youtube.com") && parsedUrl.pathname.startsWith("/embed/")) {
      return url;
    }
  } catch {
    return "";
  }
  return "";
};

export function LessonTailorEditor({
  content,
  onChange,
  onPreview,
}: LessonTailorEditorProps) {
  const [activeStep, setActiveStep] = useState<StudyStepId>("warm_up");
  
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

  const toggleBlock = (step: StudyStepId, blockKey: string) => {
    const stepObj = (content[step] as Record<string, any>) || {};
    const currentBlock = stepObj[blockKey] || { enabled: true };
    const updated = {
      ...content,
      [step]: {
        ...stepObj,
        [blockKey]: {
          ...currentBlock,
          enabled: !currentBlock.enabled,
        },
      },
    };
    handleChange(updated);
  };

  const updateTextValue = (
    step: StudyStepId,
    blockKey: string,
    field: string,
    value: string
  ) => {
    const stepObj = (content[step] as Record<string, any>) || {};
    const currentBlock = stepObj[blockKey] || { enabled: true };
    const updated = {
      ...content,
      [step]: {
        ...stepObj,
        [blockKey]: {
          ...currentBlock,
          [field]: value,
        },
      },
    };
    handleChange(updated);
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

  const insertIntoBlock = (step: StudyStepId, field: string, snippet: string) => {
    const block = (((content[step] || {}) as Record<string, any>)[field] || { text: "", enabled: true }) as Record<string, any>;
    updateTextValue(step, field, "text", `${block.text || ""}${block.text ? "\n" : ""}${snippet}`);
  };

  const getBlocks = (step: StudyStepId): ContentBlock[] =>
    (((content[step] || {}) as { blocks?: ContentBlock[] }).blocks || []);

  const updateBlocks = (step: StudyStepId, blocks: ContentBlock[]) => updateStepValue(step, "blocks", blocks);

  const createBlock = (type: ContentBlockType): ContentBlock => {
    const id = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    if (type === "text") return { id, type, title: "Text block", body: "", enabled: true };
    if (type === "audio") return { id, type, title: "Audio lesson", audioUrl: "", enabled: true };
    if (type === "video") return { id, type, title: "Video lesson", videoUrl: "", enabled: true };
    if (type === "image") return { id, type, title: "Image", imageUrl: "", caption: "", enabled: true };
    return { id, type, title: "Knowledge check", questions: [{ id: `${id}-q1`, prompt: "", options: ["", "", ""], correctAnswer: "" }], enabled: true };
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
            <option value="quiz" className="bg-slate-900 text-slate-100">Quiz / MCQ Block</option>
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
            {block.type === "text" && <textarea value={block.body} onChange={(event) => updateDynamicBlock(step, index, { body: event.target.value })} placeholder="Main body content" rows={4} className="w-full resize-none rounded border border-[#202631] bg-[#0c1017] p-2 text-xs text-stone-200 outline-none focus:border-amber-500" aria-label="Text block body" />}
            {block.type === "audio" && <input value={block.audioUrl} onChange={(event) => updateDynamicBlock(step, index, { audioUrl: event.target.value })} placeholder="Audio URL or recording URL" className="w-full rounded border border-[#202631] bg-[#0c1017] p-2 text-xs text-stone-200 outline-none focus:border-amber-500" aria-label="Audio block URL" />}
            {block.type === "video" && <div className="space-y-2"><input value={block.videoUrl} onChange={(event) => updateDynamicBlock(step, index, { videoUrl: event.target.value })} placeholder="YouTube or video embed URL" className="w-full rounded border border-[#202631] bg-[#0c1017] p-2 text-xs text-stone-200 outline-none focus:border-amber-500" aria-label="Video block URL" />{getVideoEmbedUrl(block.videoUrl) ? <div className="aspect-video overflow-hidden rounded border border-[#202631] bg-[#0c1017]"><iframe src={getVideoEmbedUrl(block.videoUrl) || undefined} title={block.title || "Lesson video"} className="h-full w-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /></div> : null}</div>}
            {block.type === "image" && <div className="space-y-2"><input value={block.imageUrl} onChange={(event) => updateDynamicBlock(step, index, { imageUrl: event.target.value })} placeholder="Image URL" className="w-full rounded border border-[#202631] bg-[#0c1017] p-2 text-xs text-stone-200 outline-none focus:border-amber-500" aria-label="Image block URL" /><input value={block.caption} onChange={(event) => updateDynamicBlock(step, index, { caption: event.target.value })} placeholder="Image caption" className="w-full rounded border border-[#202631] bg-[#0c1017] p-2 text-xs text-stone-200 outline-none focus:border-amber-500" aria-label="Image block caption" /></div>}
            {block.type === "quiz" && <div className="space-y-2"><div className="flex items-center justify-between text-xs text-stone-400"><span>Questions</span><button type="button" onClick={() => updateDynamicBlock(step, index, { questions: [...block.questions, { id: `${block.id}-q${block.questions.length + 1}`, prompt: "", options: ["", "", ""], correctAnswer: "" }] })} className="flex items-center gap-1 text-amber-300 hover:text-amber-200"><Plus className="h-3 w-3" /> Add question</button></div>{block.questions.map((question, questionIndex) => <div key={question.id} className="space-y-2 rounded border border-[#202631] bg-[#0c1017] p-2"><input value={question.prompt} onChange={(event) => updateDynamicBlock(step, index, { questions: block.questions.map((item, itemIndex) => itemIndex === questionIndex ? { ...item, prompt: event.target.value } : item) })} placeholder={`Question ${questionIndex + 1}`} className="w-full rounded border border-[#202631] bg-[#171d28] p-2 text-xs text-stone-200 outline-none focus:border-amber-500" aria-label={`Quiz question ${questionIndex + 1}`} />{question.options.map((option, optionIndex) => <input key={`${question.id}-${optionIndex}`} value={option} onChange={(event) => updateDynamicBlock(step, index, { questions: block.questions.map((item, itemIndex) => itemIndex === questionIndex ? { ...item, options: item.options.map((value, valueIndex) => valueIndex === optionIndex ? event.target.value : value) } : item) })} placeholder={`Option ${optionIndex + 1}`} className="w-full rounded border border-[#202631] bg-[#171d28] p-2 text-xs text-stone-200 outline-none focus:border-amber-500" aria-label={`Quiz question ${questionIndex + 1} option ${optionIndex + 1}`} />)}<input value={question.correctAnswer || ""} onChange={(event) => updateDynamicBlock(step, index, { questions: block.questions.map((item, itemIndex) => itemIndex === questionIndex ? { ...item, correctAnswer: event.target.value } : item) })} placeholder="Correct answer (optional)" className="w-full rounded border border-amber-500/30 bg-[#171d28] p-2 text-xs text-stone-200 outline-none focus:border-amber-500" aria-label={`Quiz question ${questionIndex + 1} correct answer`} /></div>)}</div>}
          </div>
        ))}
      </div>
    );
  };

  const renderBlockEditor = (
    step: StudyStepId,
    field: string,
    label: string,
    placeholder: string,
    multiline = false
  ) => {
    const block = ((content[step] || {}) as Record<string, any>)[field] || {
      text: "",
      enabled: true,
    };
    const Input = multiline ? "textarea" : "input";
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-amber-400">{label}</span>
          <button
            type="button"
            onClick={() => toggleBlock(step, field)}
            className="text-slate-400 hover:text-white transition"
            aria-label={`${block.enabled === false ? "Enable" : "Disable"} ${label}`}
          >
            {block.enabled !== false ? (
              <ToggleRight className="w-6 h-6 text-amber-400" />
            ) : (
              <ToggleLeft className="w-6 h-6 text-slate-500" />
            )}
          </button>
        </div>
        <Input
          value={block.text || ""}
          onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
            updateTextValue(step, field, "text", e.target.value)
          }
          placeholder={placeholder}
          rows={multiline ? 5 : undefined}
          className="w-full bg-[#171d28] border border-[#202631] rounded-md p-2.5 text-xs text-[#d9dce0] focus:outline-none focus:border-amber-500 leading-relaxed"
        />
      </div>
    );
  };

  const renderLexiconHelpers = (step: StudyStepId, field: string) => (
    <div className="flex flex-wrap items-center gap-2 text-[10px] text-stone-500">
      <span>Insert format:</span>
      {[
        ["Definition", "term (part of speech) — definition"],
        ["Tooltip", "{{term|short learner-friendly meaning}}"],
        ["Example", "term — Example sentence using the term."],
      ].map(([label, snippet]) => (
        <button
          key={label}
          type="button"
          onClick={() => insertIntoBlock(step, field, snippet)}
          className="rounded border border-[#394252] px-2 py-1 text-stone-400 transition hover:border-amber-500 hover:text-amber-300"
        >
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="bg-[#171d28]/60 border border-[#202631] rounded-xl p-5 text-[#d9dce0]">
      <div className="flex items-center justify-between mb-4 border-b border-[#202631] pb-3">
        <h2 className="font-[var(--font-fraunces)] text-xl font-semibold flex items-center gap-2">
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
        {activeStep === "warm_up" && (
          <div className="space-y-5">
            {renderBlockEditor("warm_up", "quote", "Quote", "Edit the lesson quote...")}
            {renderBlockEditor("warm_up", "intro_narrative", "Introduction", "Edit the introduction...", true)}
            {renderBlockEditor("warm_up", "lexicon_notes", "Lexicon Notes", "Edit vocabulary notes...", true)}
            {renderLexiconHelpers("warm_up", "lexicon_notes")}
            <label className="block text-xs text-stone-400">
              Media Image URL
              <input
                value={content.warm_up?.media_block?.image_url || ""}
                onChange={(e) =>
                  updateStepValue("warm_up", "media_block", {
                    ...(content.warm_up?.media_block || { enabled: true }),
                    image_url: e.target.value,
                  })
                }
                className="mt-1 w-full bg-[#171d28] border border-[#202631] rounded-md p-2.5 text-xs text-[#d9dce0] focus:outline-none focus:border-amber-500"
              />
            </label>
          </div>
        )}

        {activeStep === "lesson" && (
          <div className="space-y-5">
            {renderBlockEditor("lesson", "core_concept", "Core Concept", "Edit the core lesson concept...", true)}
            {(content.lesson?.examples || []).map((item, index) => (
              <label key={`example-${index}`} className="block text-xs text-stone-400">
                Example {index + 1}
                <input
                  value={item.text}
                  onChange={(e) => updateArrayValue("lesson", "examples", index, "text", e.target.value)}
                  className="mt-1 w-full bg-[#171d28] border border-[#202631] rounded-md p-2.5 text-xs text-[#d9dce0] focus:outline-none focus:border-amber-500"
                />
              </label>
            ))}
          </div>
        )}

        {activeStep === "listening" && (
          <div className="space-y-5">
            <label className="block text-xs text-stone-400">Audio URL<input value={content.listening?.audio_url || ""} onChange={(e) => updateStepValue("listening", "audio_url", e.target.value)} className="mt-1 w-full bg-[#171d28] border border-[#202631] rounded-md p-2.5 text-xs text-[#d9dce0] focus:outline-none focus:border-amber-500" /></label>
            {renderBlockEditor("listening", "transcript", "Transcript", "Edit the transcript...", true)}
            {(content.listening?.questions || []).map((item, index) => (
              <label key={item.id} className="block text-xs text-stone-400">Question {index + 1}<input value={item.question} onChange={(e) => updateArrayValue("listening", "questions", index, "question", e.target.value)} className="mt-1 w-full bg-[#171d28] border border-[#202631] rounded-md p-2.5 text-xs text-[#d9dce0] focus:outline-none focus:border-amber-500" /></label>
            ))}
          </div>
        )}

        {activeStep === "reading" && (
          <div className="space-y-5">
            {renderBlockEditor("reading", "article_markdown", "Article", "Edit the reading article...", true)}
            {renderBlockEditor("reading", "lexicon_notes", "Reading Lexicon", "Add notes, definitions, or tooltip-ready vocabulary...", true)}
            {renderLexiconHelpers("reading", "lexicon_notes")}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-amber-400">Vocabulary Tooltips</span>
                <button
                  type="button"
                  onClick={() => updateStepValue("reading", "vocabulary_drawer", [...(content.reading?.vocabulary_drawer || []), { word: "", definition: "", enabled: true }])}
                  className="rounded border border-[#394252] px-2 py-1 text-[10px] text-stone-400 hover:border-amber-500 hover:text-amber-300"
                >
                  Add term
                </button>
              </div>
              {(content.reading?.vocabulary_drawer || [{ word: "", definition: "", enabled: true }]).map((item, index) => (
              <div key={`${item.word}-${index}`} className="grid grid-cols-2 gap-2">
                <input value={item.word} onChange={(e) => updateArrayValue("reading", "vocabulary_drawer", index, "word", e.target.value)} className="bg-[#171d28] border border-[#202631] rounded-md p-2.5 text-xs text-[#d9dce0] focus:outline-none focus:border-amber-500" aria-label={`Vocabulary word ${index + 1}`} />
                <input value={item.definition} onChange={(e) => updateArrayValue("reading", "vocabulary_drawer", index, "definition", e.target.value)} className="bg-[#171d28] border border-[#202631] rounded-md p-2.5 text-xs text-[#d9dce0] focus:outline-none focus:border-amber-500" aria-label={`Vocabulary definition ${index + 1}`} />
              </div>
            ))}
            </div>
          </div>
        )}

        {activeStep === "writing" && (
          <div className="space-y-5">
            {renderBlockEditor("writing", "prompt", "Writing Prompt", "Edit the writing prompt...", true)}
            <label className="block text-xs text-stone-400">Draft Placeholder<input value={content.writing?.draft_editor?.placeholder || ""} onChange={(e) => updateStepValue("writing", "draft_editor", { ...(content.writing?.draft_editor || { enabled: true }), placeholder: e.target.value })} className="mt-1 w-full bg-[#171d28] border border-[#202631] rounded-md p-2.5 text-xs text-[#d9dce0] focus:outline-none focus:border-amber-500" /></label>
          </div>
        )}

        {activeStep === "speaking" && (
          <div className="space-y-5">
            {renderBlockEditor("speaking", "scenario", "Speaking Scenario", "Edit the speaking scenario...", true)}
            {(content.speaking?.discussion_points || []).map((item, index) => (
              <label key={`discussion-${index}`} className="block text-xs text-stone-400">Discussion Point {index + 1}<input value={item.text} onChange={(e) => updateArrayValue("speaking", "discussion_points", index, "text", e.target.value)} className="mt-1 w-full bg-[#171d28] border border-[#202631] rounded-md p-2.5 text-xs text-[#d9dce0] focus:outline-none focus:border-amber-500" /></label>
            ))}
          </div>
        )}

        {activeStep === "results" && (
          <div className="space-y-5">
            {renderBlockEditor("results", "self_reflection", "Self Reflection", "Edit the reflection prompt...", true)}
            <label className="block text-xs text-stone-400">Instructor Review Prompt<input value={content.results?.instructor_review_card?.prompt || ""} onChange={(e) => updateStepValue("results", "instructor_review_card", { ...(content.results?.instructor_review_card || { enabled: true }), prompt: e.target.value })} className="mt-1 w-full bg-[#171d28] border border-[#202631] rounded-md p-2.5 text-xs text-[#d9dce0] focus:outline-none focus:border-amber-500" /></label>
          </div>
        )}
      </div>
    </div>
  );
}

export default LessonTailorEditor;
