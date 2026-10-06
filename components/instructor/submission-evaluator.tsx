"use client";

import React, { useEffect, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ClipboardCheck, Mic, Save } from "lucide-react";
import { LessonEvaluation } from "@/types/lesson";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { getSubmissionById, getSubmissionByLessonAndStudent } from "@/lib/evaluations";
import { saveInstructorFeedback, uploadVoiceFeedback } from "@/services/storage-service";
import { CustomAudioPlayer } from "@/components/study-room/custom-audio-player";
import { AudioRecorder } from "@/components/shared/audio-recorder";
import { TiptapEditor } from "@/components/shared/tiptap-editor";
import { type UnifiedReportStage } from "@/components/shared/unified-report-card";
import { combineTaskFeedback } from "@/lib/evaluation-feedback";
import {
  type RubricScale,
  RUBRIC_SCALE_OPTIONS,
  aggregateOverallRubric,
  convertRubricScore,
  displayRubricScore,
  formatOverallRubricTotal,
  formatRubricScore,
  getRubricScale,
  normalizeRubricScore,
  roundRubricScoreForScale,
} from "@/lib/rubric-scoring";

export type { RubricScale } from "@/lib/rubric-scoring";

export interface FeedbackPayload {
  scores: Record<string, number>;
  totalScore: number;
  comments: string;
  criterionFeedback: Record<string, string>;
  stageFeedback: Record<string, string>;
  stageScores: Record<string, Record<string, number>>;
  stageRubricScales: Record<string, RubricScale>;
  reportCardScoreOverrides: Record<string, number>;
  taskFeedback: Record<string, string>;
  inlineCorrections: Record<string, string>;
  stageVoiceFeedback: Record<string, string>;
}

interface SubmissionEvaluatorProps {
  lessonId?: string;
  pendingSubmissionId?: string;
  studentName?: string;
  studentId?: string;
  instructorId?: string;
  onSubmitFeedback?: (data: FeedbackPayload) => void | Promise<void>;
  onSaveDraft?: (data: FeedbackPayload) => void | Promise<void>;
  evaluation?: LessonEvaluation;
  reportCardStages?: UnifiedReportStage[];
  onUpdateEvaluation?: (evaluation: LessonEvaluation) => void;
  useSupabase?: boolean; // When true, submits to Supabase instead of callback
}

const RUBRIC_CRITERIA = [
  { id: "task", label: "Task Achievement & Depth", max: 5 },
  { id: "coherence", label: "Coherence & Flow", max: 5 },
  { id: "lexical", label: "Lexical Precision & Range", max: 5 },
  { id: "grammar", label: "Grammatical Accuracy", max: 5 },
];
const STAGE_RUBRIC_CRITERIA = RUBRIC_CRITERIA;
const DEFAULT_RUBRIC_SCALE: RubricScale = "standard-5";
const DEFAULT_REPORT_STAGES: UnifiedReportStage[] = [
  { id: "warm_up", title: "Warm-up", tasks: [] },
  { id: "lesson", title: "Lesson", tasks: [] },
  { id: "listening", title: "Listening", tasks: [] },
  { id: "reading", title: "Reading", tasks: [] },
  { id: "writing", title: "Writing", tasks: [] },
  { id: "speaking", title: "Speaking", tasks: [] },
];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function stripMarkdown(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|h[1-6]|li|blockquote|div)>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1$2")
    .replace(/(^|[^_])_([^_\n]+)_(?!_)/g, "$1$2")
    .replace(/[*_~`]/g, "")
    .trim();
}

function normalizeAnswer(value: string) {
  return value.trim().toLowerCase().replace(/^[a-z]\s*[).]\s*/, "").trim();
}

function isMissingDatabaseObject(error: { code?: string; message?: string; status?: number } | null) {
  if (!error) return false;
  return error.status === 404
    || error.code === "42P01"
    || error.code === "42703"
    || error.code === "PGRST204"
    || error.code === "PGRST205"
    || /does not exist|could not find the table|schema cache/i.test(error.message || "");
}

export function SubmissionEvaluator({
  lessonId,
  pendingSubmissionId,
  studentName = "Student",
  studentId,
  instructorId,
  onSubmitFeedback,
  onSaveDraft,
  evaluation,
  reportCardStages = [],
  onUpdateEvaluation,
  useSupabase = true,
}: SubmissionEvaluatorProps) {
  const comments = evaluation?.comments || "";
  const criterionFeedback = evaluation?.criterionFeedback || {};
  const stageFeedback = evaluation?.stageFeedback || {};
  const stageScores = evaluation?.stageScores || {};
  const stageRubricScales = evaluation?.stageRubricScales || {};
  const reportCardScoreOverrides = evaluation?.reportCardScoreOverrides || {};
  const overallAggregation = aggregateOverallRubric({
    criterionIds: RUBRIC_CRITERIA.map(({ id }) => id),
    stageScores,
    stageRubricScales,
    reportCardScoreOverrides,
    fallbackScores: evaluation?.scores,
  });
  const overallScaleId = overallAggregation.scaleId;
  const overallScale = getRubricScale(overallScaleId);
  const stageAverages = Object.fromEntries(RUBRIC_CRITERIA.map(({ id }) => {
    const values = Object.entries(stageScores)
      .map(([stageId, stage]) => {
        const score = stage[id];
        return typeof score === "number" ? normalizeRubricScore(score, stageRubricScales[stageId]) : undefined;
      })
      .filter((score): score is number => typeof score === "number" && Number.isFinite(score));
    return [id, values.length ? values.reduce((sum, score) => sum + score, 0) / values.length : undefined];
  }));
  const scores = overallAggregation.criterionScores;
  const displayScores = overallAggregation.displayCriterionScores;
  const taskFeedback = evaluation?.taskFeedback || {};
  const inlineCorrections = evaluation?.inlineCorrections || {};
  const stageVoiceFeedback = evaluation?.stageVoiceFeedback || {};
  const stages = reportCardStages.length ? reportCardStages : DEFAULT_REPORT_STAGES;
  const [activeStageId, setActiveStageId] = useState(stages[0]?.id || "report-card");
  const [expandedTaskFeedback, setExpandedTaskFeedback] = useState<Record<string, boolean>>({});
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isSavingDraft, setIsSavingDraft] = useState<boolean>(false);
  const [draftStatus, setDraftStatus] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [publishNotice, setPublishNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [voiceUploadStage, setVoiceUploadStage] = useState<string | null>(null);
  const [voiceUploadError, setVoiceUploadError] = useState<string | null>(null);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [submissionLoadState, setSubmissionLoadState] = useState<
    "idle" | "loading" | "loaded" | "missing"
  >(useSupabase ? "idle" : "loaded");

  // Load existing submission and evaluation if useSupabase is enabled
  useEffect(() => {
    if (useSupabase && lessonId?.trim() && studentId?.trim()) {
      loadSubmissionData();
    }
  }, [lessonId, studentId, pendingSubmissionId, useSupabase]);

  const loadSubmissionData = async () => {
    const normalizedLessonId = lessonId?.trim() || "";
    const normalizedStudentId = studentId?.trim() || "";
    if (!isSupabaseConfigured()
      || !UUID_PATTERN.test(normalizedLessonId)
      || !UUID_PATTERN.test(normalizedStudentId)
      || (pendingSubmissionId !== undefined && !UUID_PATTERN.test(pendingSubmissionId))) {
      setSubmissionId(null);
      setSubmissionLoadState("missing");
      return;
    }
    setSubmissionId(null);
    setSubmissionLoadState("loading");
    try {
      const [submission, feedbackResult] = await Promise.all([
        pendingSubmissionId
          ? getSubmissionById(pendingSubmissionId, normalizedLessonId, normalizedStudentId)
          : getSubmissionByLessonAndStudent(normalizedLessonId, normalizedStudentId),
        supabase
          .from("instructor_feedback")
          .select("*")
          .eq("lesson_id", normalizedLessonId)
          .eq("student_id", normalizedStudentId)
          .eq("is_published", true)
          .maybeSingle(),
      ]);
      if (submission) {
        setSubmissionId(submission.id);
        setSubmissionLoadState("loaded");
      } else {
        setSubmissionId(null);
        setSubmissionLoadState("missing");
      }
      if (feedbackResult.error) {
        const message = feedbackResult.error.message || "Rubric is not available yet.";
        if (!isMissingDatabaseObject(feedbackResult.error) && feedbackResult.error.code !== "PGRST116") {
          console.warn("Student lesson rubric could not be loaded:", message);
        }
      }
      let draftEvaluation: LessonEvaluation | null = null;
      if (submission && instructorId && UUID_PATTERN.test(instructorId)) {
        const draftResult = await supabase
          .from("instructor_evaluation_drafts")
          .select("evaluation")
          .eq("submission_id", submission.id)
          .eq("instructor_id", instructorId)
          .maybeSingle();
        if (draftResult.error) {
          if (!isMissingDatabaseObject(draftResult.error) && draftResult.error.code !== "PGRST116") {
            console.warn("Instructor evaluation draft could not be loaded:", draftResult.error.message);
          }
        } else if (draftResult.data?.evaluation && typeof draftResult.data.evaluation === "object") {
          draftEvaluation = draftResult.data.evaluation as LessonEvaluation;
        }
      }
      const feedback = feedbackResult.data;
      if (draftEvaluation) {
        onUpdateEvaluation?.({ ...draftEvaluation, published: false });
      } else if (feedback) {
        const rubricScores = feedback.rubric_scores || feedback.scores || feedback.criterion_feedback?.scores || {};
        onUpdateEvaluation?.({
          scores: rubricScores,
          totalScore: Number(feedback.total_score ?? feedback.score ?? Object.values(rubricScores).reduce<number>((total, score) => total + Number(score), 0)),
          comments: typeof feedback.criterion_feedback?.overallComments === "string"
            ? feedback.criterion_feedback.overallComments
            : feedback.comments || "",
          criterionFeedback: feedback.criterion_feedback?.comments || feedback.criterion_feedback || evaluation?.criterionFeedback || {},
          stageFeedback: feedback.criterion_feedback?.stages || evaluation?.stageFeedback || {},
          stageScores: feedback.criterion_feedback?.stageScores || evaluation?.stageScores || {},
          stageRubricScales: feedback.criterion_feedback?.stageRubricScales || evaluation?.stageRubricScales || {},
          reportCardScoreOverrides: feedback.criterion_feedback?.reportCardScoreOverrides || evaluation?.reportCardScoreOverrides || {},
          taskFeedback: feedback.criterion_feedback?.taskFeedback || evaluation?.taskFeedback || {},
          inlineCorrections: feedback.criterion_feedback?.inlineCorrections || evaluation?.inlineCorrections || {},
          stageVoiceFeedback: feedback.criterion_feedback?.stageVoiceFeedback || evaluation?.stageVoiceFeedback || {},
          strengths: feedback.strengths || undefined,
          areasToImprove: feedback.areas_to_improve || undefined,
          studyHubPrescription: feedback.study_hub_prescription || undefined,
          voiceFeedbackUrl: feedback.voice_feedback_url || undefined,
          published: Boolean(feedback.is_published),
        });
      }
    } catch (error) {
      setSubmissionId(null);
      setSubmissionLoadState("missing");
      if (error instanceof Error) console.warn("Student submission could not be refreshed:", error.message);
    }
  };

  const handleScoreChange = (id: string, val: number) => {
    const normalizedScore = normalizeRubricScore(val, overallScaleId);
    updateEvaluation({
      scores: { ...scores, [id]: normalizedScore },
      reportCardScoreOverrides: { ...reportCardScoreOverrides, [id]: normalizedScore },
    });
  };

  const updateEvaluation = (changes: Partial<LessonEvaluation>) => {
    onUpdateEvaluation?.({
      ...evaluation,
      scores,
      comments,
      criterionFeedback,
      stageFeedback,
      stageScores,
      stageRubricScales,
      reportCardScoreOverrides,
      taskFeedback,
      inlineCorrections,
      stageVoiceFeedback,
      ...changes,
    });
    setIsSubmitted(false);
    setDraftStatus(null);
  };

  const totalScore = overallAggregation.totalScore;
  const reportStageId = "report-card";
  const reportStageIndex = stages.length;
  const activeStageIndex = activeStageId === reportStageId
    ? reportStageIndex
    : Math.max(0, stages.findIndex((stage) => stage.id === activeStageId));
  const activeStage = stages[activeStageIndex];
  const activeStageTitle = activeStage ? activeStage.title : "Report Card";
  const evaluationStatus = (stageId: string) => {
    if (evaluation?.published) return "Evaluated";
    const stage = stages.find((item) => item.id === stageId);
    if (stageFeedback[stageId]?.trim()
      || stageVoiceFeedback[stageId]
      || Object.values(stageScores[stageId] || {}).some((score) => score > 0)
      || stage?.tasks.some((task) => taskFeedback[task.id]?.trim() || inlineCorrections[task.id]?.trim())) return "In progress";
    return "Pending Review";
  };
  const payload: FeedbackPayload = {
    scores,
    totalScore,
    comments,
    criterionFeedback,
    stageFeedback,
    stageScores,
    stageRubricScales,
    reportCardScoreOverrides,
    taskFeedback,
    inlineCorrections,
    stageVoiceFeedback,
  };

  const handleSaveDraft = async () => {
    setIsSavingDraft(true);
    setSubmitError(null);
    setDraftStatus(null);
    try {
      if (onSaveDraft) {
        await onSaveDraft(payload);
      } else if (useSupabase && lessonId && studentId && submissionId) {
        await saveInstructorFeedback(lessonId, studentId, { ...evaluation, ...payload, published: false }, submissionId, false);
      } else {
        throw new Error("Draft saving is unavailable for this evaluation.");
      }
      setDraftStatus("Draft saved. It has not been sent to the student.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save the evaluation draft.";
      setSubmitError(message);
      console.error("Error saving evaluation draft:", error);
    } finally {
      setIsSavingDraft(false);
    }
  };

  const uploadStageVoiceNote = async (stageId: string, audio: Blob) => {
    setVoiceUploadStage(stageId);
    setVoiceUploadError(null);
    try {
      const extension = audio.type.includes("mp4") ? "mp4" : audio.type.includes("ogg") ? "ogg" : "webm";
      const asset = await uploadVoiceFeedback(audio, `${studentId || "student"}-${stageId}-${Date.now()}.${extension}`);
      updateEvaluation({ stageVoiceFeedback: { ...stageVoiceFeedback, [stageId]: asset.url } });
    } catch (error) {
      setVoiceUploadError(error instanceof Error ? error.message : "Unable to upload the voice note.");
      console.error("Evaluation voice note upload failed:", error);
    } finally {
      setVoiceUploadStage(null);
    }
  };

  const handleSubmit = async () => {
    setPublishNotice(null);
    setSubmitError(null);
    if (!onSubmitFeedback && (!useSupabase || !lessonId || !studentId || !submissionId)) {
      const message = "Missing required data for submission";
      setSubmitError(message);
      setPublishNotice({ type: "error", message });
      return;
    }

    setIsSubmitting(true);
    try {
      const publishedEvaluation: LessonEvaluation = {
        ...evaluation,
        scores,
        totalScore,
        comments,
        criterionFeedback,
        stageFeedback,
        stageScores,
        stageRubricScales,
        reportCardScoreOverrides,
        taskFeedback,
        inlineCorrections,
        stageVoiceFeedback,
        published: true,
      };
      if (onSubmitFeedback) {
        await onSubmitFeedback({ ...payload, totalScore });
      } else {
        await saveInstructorFeedback(lessonId!, studentId!, publishedEvaluation, submissionId!, true);
      }

      setIsSubmitted(true);
      onUpdateEvaluation?.(publishedEvaluation);
      setPublishNotice({ type: "success", message: "Evaluation successfully published and sent to the student." });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to submit evaluation";
      const databaseError = error && typeof error === "object"
        ? error as { code?: string; message?: string; status?: number }
        : null;
      if (isMissingDatabaseObject(databaseError)) {
        setSubmitError("Evaluation storage is unavailable. Apply the latest Supabase migrations and try again.");
        setPublishNotice({ type: "error", message: "Evaluation could not be published. Evaluation storage is unavailable; apply the latest Supabase migrations and try again." });
      } else {
        setSubmitError(errorMessage);
        setPublishNotice({ type: "error", message: errorMessage });
        console.error("Error submitting evaluation:", error);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const changeActiveStage = (stageId: string) => {
    setActiveStageId(stageId);
    setVoiceUploadError(null);
  };
  const stageStatusClass = (status: string) => status === "Evaluated"
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
    : status === "In progress"
      ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
      : "border-[#394252] bg-[#171d28] text-stone-500";
  const feedbackError = submitError || (useSupabase && submissionLoadState === "missing" ? "Student has not submitted work for this lesson yet." : null);
  const stageStepper = <div className="w-full min-w-0 overflow-x-auto border-b border-[#293343]">
    <nav className="flex w-full min-w-0 justify-between gap-0 px-0" aria-label="Evaluation stages">
      {stages.map((stage, index) => <button
        key={stage.id}
        type="button"
        onClick={() => changeActiveStage(stage.id)}
        aria-current={activeStageId === stage.id ? "step" : undefined}
        className={`shrink-0 whitespace-nowrap border-b-2 px-0 py-3 text-left text-xs transition ${activeStageId === stage.id ? "border-amber-400 text-amber-300" : "border-transparent text-stone-500 hover:text-stone-200"}`}
      >
        <span className="mr-1.5 font-mono text-[10px] text-stone-600">{String(index + 1).padStart(2, "0")}</span>{stage.title}
      </button>)}
      <button
        type="button"
        onClick={() => changeActiveStage(reportStageId)}
        aria-current={activeStageId === reportStageId ? "step" : undefined}
        className={`shrink-0 whitespace-nowrap border-b-2 px-0 py-3 text-left text-xs transition ${activeStageId === reportStageId ? "border-amber-400 text-amber-300" : "border-transparent text-stone-500 hover:text-stone-200"}`}
      >
        <span className="mr-1.5 font-mono text-[10px] text-stone-600">07</span>Report Card
      </button>
    </nav>
  </div>;
  const stageHeading = <header className="flex flex-wrap items-end justify-between gap-3 border-b border-[#202631] pb-4">
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-amber-400">{activeStageId === reportStageId ? "Final review" : `Stage ${String(activeStageIndex + 1).padStart(2, "0")} of 07`}</p>
      <h2 className="mt-1 text-xl font-semibold text-stone-100">{activeStageTitle}</h2>
    </div>
    {activeStageId !== reportStageId && activeStage && <span className={`rounded-full border px-2.5 py-1 text-[10px] ${stageStatusClass(evaluationStatus(activeStage.id))}`}>{evaluationStatus(activeStage.id)}</span>}
  </header>;

  return <div className="space-y-5">
    {publishNotice && <div
      role={publishNotice.type === "error" ? "alert" : "status"}
      aria-live={publishNotice.type === "error" ? "assertive" : "polite"}
      className={`fixed right-6 top-6 z-[100] flex max-w-md items-start gap-3 rounded-lg border p-4 text-sm shadow-xl ${
        publishNotice.type === "success"
          ? "border-emerald-500/40 bg-[#111b18] text-emerald-200"
          : "border-red-500/40 bg-[#201416] text-red-200"
      }`}
    >
      <span className="flex-1">{publishNotice.message}</span>
      <button type="button" onClick={() => setPublishNotice(null)} className="shrink-0 text-xs opacity-75 hover:opacity-100" aria-label="Dismiss notification">Dismiss</button>
    </div>}
    <div className="grid items-start gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
      <aside className="flex flex-col rounded-xl border border-[#202631] bg-[#111620] p-4 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)]" aria-label="Evaluation tools">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-amber-400">Evaluation Studio</p>
          <h2 className="mt-1 text-sm font-semibold text-stone-100">{studentName}</h2>
        </div>
        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto py-4" aria-label="Stage status">
          {stages.map((stage, index) => {
            const status = evaluationStatus(stage.id);
            return <button
              key={stage.id}
              type="button"
              onClick={() => changeActiveStage(stage.id)}
              className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left transition ${activeStageId === stage.id ? "bg-amber-500/10 text-amber-200" : "text-stone-400 hover:bg-[#171d28] hover:text-stone-200"}`}
            >
              <span className="min-w-0 truncate text-xs"><span className="mr-2 font-mono text-[10px] text-stone-600">{String(index + 1).padStart(2, "0")}</span>{stage.title}</span>
              <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] ${stageStatusClass(status)}`}>{status}</span>
            </button>;
          })}
          <button
            type="button"
            onClick={() => changeActiveStage(reportStageId)}
            className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left transition ${activeStageId === reportStageId ? "bg-amber-500/10 text-amber-200" : "text-stone-400 hover:bg-[#171d28] hover:text-stone-200"}`}
          >
            <span className="text-xs"><span className="mr-2 font-mono text-[10px] text-stone-600">07</span>Report Card</span>
            <span className={`rounded-full border px-1.5 py-0.5 text-[9px] ${stageStatusClass(evaluation?.published ? "Evaluated" : "Pending Review")}`}>{evaluation?.published ? "Evaluated" : "Preview"}</span>
          </button>
        </nav>
        <div className="mt-auto shrink-0 space-y-2 border-t border-[#293343] pt-4">
          <button type="button" onClick={() => void handleSaveDraft()} disabled={isSavingDraft || isSubmitting || voiceUploadStage !== null || (useSupabase && submissionLoadState !== "loaded")} className="flex w-full items-center justify-center gap-2 rounded-md border border-[#394252] px-3 py-2 text-xs text-stone-200 transition hover:border-amber-500/40 disabled:cursor-wait disabled:opacity-50">
            <Save className="h-3.5 w-3.5" aria-hidden="true" />{isSavingDraft ? "Saving Draft..." : "Save Draft"}
          </button>
          <button type="button" onClick={() => changeActiveStage(reportStageId)} className="flex w-full items-center justify-center gap-2 rounded-md border border-[#394252] px-3 py-2 text-xs text-stone-200 transition hover:border-amber-500/40">
            <ClipboardCheck className="h-3.5 w-3.5" aria-hidden="true" />Jump to Report Card
          </button>
          <button type="button" onClick={() => void handleSubmit()} disabled={isSubmitting || isSubmitted || voiceUploadStage !== null || (useSupabase && submissionLoadState !== "loaded")} className="w-full rounded-md bg-amber-500/20 px-3 py-2.5 text-xs font-semibold text-amber-300 transition hover:bg-amber-500/30 disabled:cursor-wait disabled:opacity-50">
            {isSubmitting ? "Publishing..." : isSubmitted ? "Evaluation Published" : "Publish Evaluation"}
          </button>
          {draftStatus && <p role="status" className="text-[11px] leading-relaxed text-emerald-300">{draftStatus}</p>}
        </div>
      </aside>

      <section className="min-w-0 space-y-5" aria-label={`${activeStageTitle} evaluation`}>
        {activeStageId === reportStageId ? <div className="space-y-5">
          {stageStepper}
          {stageHeading}
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
            <p className="text-sm font-medium text-amber-200">Compiled Report Card Preview</p>
            <p className="mt-1 text-xs leading-relaxed text-stone-400">Review the scores, comments, corrections, and voice notes collected across all six lesson stages before publishing to {studentName}.</p>
          </div>
          <section className="space-y-3 rounded-xl border border-[#202631] bg-[#171d28]/60 p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-stone-100">Overall Rubric</h3>
              <span className="text-xs text-amber-300">{formatOverallRubricTotal(totalScore, overallScaleId, overallAggregation.totalDenominator)}</span>
            </div>
            <p className="text-[11px] leading-relaxed text-stone-500">Each criterion starts as the average of its ratings across stages. Adjust a score here to fine-tune the final report.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {RUBRIC_CRITERIA.map((criterion) => <div key={criterion.id} className="rounded-lg border border-[#293343] bg-[#0c1017] p-3">
                <div className="flex justify-between gap-2 text-xs"><span className="text-stone-300">{criterion.label}</span><span className="text-amber-300">{displayScores[criterion.id] === undefined ? `—/${overallScale.max}` : `${formatRubricScore(displayScores[criterion.id])}/${overallScale.max}`}</span></div>
                {stageAverages[criterion.id] !== undefined && <p className="mt-1 text-[10px] text-stone-500">{reportCardScoreOverrides[criterion.id] !== undefined ? `Stage average: ${formatRubricScore(roundRubricScoreForScale(displayRubricScore(stageAverages[criterion.id] ?? 0, overallScaleId), overallScaleId))}/${overallScale.max} · Manually adjusted` : `Average of ${overallAggregation.criterionStageCounts[criterion.id]} stage ratings`}</p>}
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="range"
                    min={overallScale.min}
                    max={overallScale.max}
                    step={overallScale.step}
                    value={displayScores[criterion.id] ?? overallScale.min}
                    onChange={(event) => handleScoreChange(criterion.id, Number(event.target.value))}
                    className="min-w-0 flex-1 accent-amber-500"
                    aria-label={`${criterion.label} score`}
                  />
                  <input
                    type="number"
                    min={overallScale.min}
                    max={overallScale.max}
                    step={overallScale.step}
                    value={displayScores[criterion.id] ?? overallScale.min}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      if (event.target.value !== "" && Number.isFinite(value) && value >= overallScale.min && value <= overallScale.max) {
                        handleScoreChange(criterion.id, value);
                      }
                    }}
                    className="rubric-score-input w-16 rounded border border-[#394252] bg-[#171d28] px-2 py-1 text-center text-xs text-amber-300 outline-none focus:border-amber-500/40"
                    aria-label={`${criterion.label} score value`}
                  />
                </div>
                <textarea value={criterionFeedback[criterion.id] || ""} onChange={(event) => updateEvaluation({ criterionFeedback: { ...criterionFeedback, [criterion.id]: event.target.value } })} rows={2} placeholder={`Feedback for ${criterion.label.toLowerCase()}...`} className="mt-2 w-full resize-y rounded-md border border-[#394252] bg-[#171d28] p-2 text-xs text-stone-200 outline-none focus:border-amber-500/40" />
              </div>)}
            </div>
          </section>
          {stages.map((stage, index) => <section key={stage.id} className="space-y-3 rounded-xl border border-[#202631] bg-[#171d28]/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#293343] pb-2">
              <h3 className="text-sm font-semibold text-stone-100">{String(index + 1).padStart(2, "0")} · {stage.title}</h3>
              <span className={`rounded-full border px-2 py-0.5 text-[9px] ${stageStatusClass(evaluationStatus(stage.id))}`}>{evaluationStatus(stage.id)}</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {STAGE_RUBRIC_CRITERIA.map((criterion) => {
                const scale = getRubricScale(stageRubricScales[stage.id]);
                return <label key={criterion.id} className="rounded-md border border-[#293343] bg-[#0c1017] p-2 text-[10px] text-stone-400">{criterion.label}<span className="float-right text-amber-300">{formatRubricScore(roundRubricScoreForScale(stageScores[stage.id]?.[criterion.id] || 0, stageRubricScales[stage.id]))}/{scale.max}</span></label>;
              })}
            </div>
            {stageFeedback[stage.id]?.trim() && <p className="whitespace-pre-wrap rounded-md bg-[#0c1017] p-3 text-xs leading-relaxed text-stone-300">{stageFeedback[stage.id]}</p>}
            {stage.tasks.map((task) => <div key={task.id} className="space-y-1 rounded-md border border-[#293343] bg-[#0c1017] p-3 text-xs">
              <p className="font-medium text-stone-300">{task.title}</p>
              {combineTaskFeedback(taskFeedback[task.id], inlineCorrections[task.id]) && <div className="mt-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-300">INSTRUCTOR FEEDBACK &amp; CORRECTION</p>
                <TiptapEditor value={combineTaskFeedback(taskFeedback[task.id], inlineCorrections[task.id])} onChange={() => {}} ariaLabel={`${task.title} instructor feedback`} readOnly />
              </div>}
            </div>)}
            {stageVoiceFeedback[stage.id] && <div className="space-y-1"><p className="text-[10px] text-stone-500">Voice note</p><CustomAudioPlayer src={stageVoiceFeedback[stage.id]} label={`${stage.title} instructor voice note`} /></div>}
          </section>)}
          <section className="space-y-3 rounded-xl border border-[#202631] bg-[#171d28]/60 p-4">
            <h3 className="text-sm font-semibold text-stone-100">Final Student Feedback</h3>
            <textarea value={comments} onChange={(event) => updateEvaluation({ comments: event.target.value })} rows={4} placeholder="Personalized feedback and corrections..." className="w-full resize-y rounded-md border border-[#394252] bg-[#0c1017] p-3 text-sm text-stone-200 outline-none focus:border-amber-500/40" aria-label="Personalized feedback" />
            <div className="grid gap-3 sm:grid-cols-2">
              <textarea value={evaluation?.strengths || ""} onChange={(event) => updateEvaluation({ strengths: event.target.value })} rows={3} placeholder="Specific strengths..." className="w-full resize-y rounded-md border border-[#394252] bg-[#0c1017] p-3 text-xs text-stone-200 outline-none focus:border-amber-500/40" aria-label="Student strengths" />
              <textarea value={evaluation?.areasToImprove || ""} onChange={(event) => updateEvaluation({ areasToImprove: event.target.value })} rows={3} placeholder="Focused next steps..." className="w-full resize-y rounded-md border border-[#394252] bg-[#0c1017] p-3 text-xs text-stone-200 outline-none focus:border-amber-500/40" aria-label="Areas to improve" />
            </div>
            <textarea value={evaluation?.studyHubPrescription || ""} onChange={(event) => updateEvaluation({ studyHubPrescription: event.target.value })} rows={2} placeholder="Recommended study resource or topic..." className="w-full resize-y rounded-md border border-[#394252] bg-[#0c1017] p-3 text-xs text-stone-200 outline-none focus:border-amber-500/40" aria-label="Study Hub prescription" />
          </section>
        </div> : activeStage ?         <div className="min-w-0 space-y-5">
          <div className="min-w-0 space-y-5">
            {stageStepper}
            {stageHeading}
            {(activeStage.id === "reading" || activeStage.id === "listening") && (activeStage.referenceText || activeStage.referenceAudioUrl) && <details className="rounded-lg border border-[#293343] bg-[#111620] p-3">
              <summary className="cursor-pointer text-xs font-medium text-stone-300">Show lesson reference</summary>
              {activeStage.referenceText && <p className="mt-3 whitespace-pre-wrap text-xs leading-relaxed text-stone-400">{stripMarkdown(activeStage.referenceText)}</p>}
              {activeStage.referenceAudioUrl && <div className="mt-3"><CustomAudioPlayer src={activeStage.referenceAudioUrl} label={`${activeStage.title} lesson reference audio`} /></div>}
            </details>}
            {activeStage.tasks.length ? activeStage.tasks.map((task, index) => {
              const feedbackSectionId = `${activeStage.id}:${task.id}`;
              const isFeedbackExpanded = expandedTaskFeedback[feedbackSectionId] ?? false;
              const normalizedAnswer = task.studentAnswer ? normalizeAnswer(task.studentAnswer) : "";
              const matchesCorrectAnswer = task.modelAnswer?.split(/[\/|]/).some(
                (candidate) => normalizeAnswer(candidate) === normalizedAnswer,
              ) ?? false;
              const isObjectiveAnswer = Boolean(task.studentAnswer?.trim())
                && (task.isCorrect !== undefined || task.autoCheck === true);
              const isCorrect = task.isCorrect !== undefined ? task.isCorrect : task.autoCheck === true && matchesCorrectAnswer;
              const responseBoxClass = isCorrect
                ? "border-emerald-500/30 bg-emerald-500/5"
                : isObjectiveAnswer
                  ? "border-rose-500/30 bg-rose-500/5"
                  : "border-[#394252] bg-[#0c1017]";
              const responseLabelClass = isCorrect
                ? "text-emerald-300"
                : isObjectiveAnswer
                  ? "text-rose-300"
                  : "text-stone-400";
              const responseTextClass = isCorrect
                ? "text-emerald-100"
                : isObjectiveAnswer
                  ? "text-rose-100"
                  : "text-stone-200";
              const modelBoxClass = isObjectiveAnswer
                ? "border-emerald-500/30 bg-emerald-500/5"
                : "border-blue-500/20 bg-blue-500/5";
              const modelLabelClass = isObjectiveAnswer ? "text-emerald-300" : "text-blue-300";
              const modelTextClass = isObjectiveAnswer ? "text-emerald-100" : "text-blue-100";
              return <article key={task.id} className="space-y-3 rounded-xl border border-[#293343] bg-[#111620] p-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">Student task {task.taskNumber ?? index + 1}</p>
                  <h3 className="mt-1 text-sm font-medium leading-relaxed text-stone-100">{stripMarkdown(task.title)}</h3>
                </div>
                <div className={`rounded-lg border p-4 ${responseBoxClass}`}>
                  <p className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${responseLabelClass}`}>Student response</p>
                  <p className={`mt-2 whitespace-pre-wrap break-words rounded-sm px-2 py-3 text-sm leading-relaxed ${isCorrect ? "bg-emerald-300/10" : isObjectiveAnswer ? "bg-rose-300/10" : "bg-[#171d28]"} ${responseTextClass}`}>{stripMarkdown(task.studentAnswer) || <span className="italic text-stone-500">No response submitted.</span>}</p>
                  {task.audioUrls?.map((url, audioIndex) => <div key={`${url}-${audioIndex}`} className="mt-2"><CustomAudioPlayer src={url} label={`${task.title} student recording`} /></div>)}
                </div>
                {task.modelAnswer && <div className={`rounded-md border p-4 ${modelBoxClass}`}>
                  <p className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${modelLabelClass}`}>Model answer</p>
                  <p className={`mt-2 whitespace-pre-wrap py-2 text-sm leading-relaxed ${modelTextClass}`}>{stripMarkdown(task.modelAnswer)}</p>
                </div>}
                <div>
                  <button
                    type="button"
                    aria-expanded={isFeedbackExpanded}
                    aria-controls={`task-feedback-editor-${index}`}
                    onClick={() => setExpandedTaskFeedback((current) => ({
                      ...current,
                      [feedbackSectionId]: !isFeedbackExpanded,
                    }))}
                    className="flex w-full items-center gap-2 rounded-md py-1 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-300 transition hover:text-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50"
                  >
                    {isFeedbackExpanded
                      ? <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      : <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                    INSTRUCTOR FEEDBACK &amp; CORRECTION
                  </button>
                  <div
                    id={`task-feedback-editor-${index}`}
                    className={`grid transition-[grid-template-rows] duration-200 ease-in-out ${isFeedbackExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
                    aria-hidden={!isFeedbackExpanded}
                    inert={!isFeedbackExpanded}
                  >
                    <div className="min-h-0 overflow-hidden">
                      <TiptapEditor
                        value={combineTaskFeedback(taskFeedback[task.id], inlineCorrections[task.id])}
                        onChange={(value) => updateEvaluation({
                          taskFeedback: { ...taskFeedback, [task.id]: value },
                          inlineCorrections: Object.fromEntries(Object.entries(inlineCorrections).filter(([id]) => id !== task.id)),
                        })}
                        placeholder="Write a correction, explanation, or note about this response..."
                        ariaLabel={`${task.title} instructor feedback and correction`}
                        compact
                        wrapToolbar
                      />
                    </div>
                  </div>
                </div>
              </article>;
            }) : <div className="rounded-lg border border-dashed border-[#394252] bg-[#111620] p-5 text-center">
              <p className="text-sm font-medium text-stone-300">No interactive response in this stage</p>
              <p className="mt-1 text-xs text-stone-500">You can still add a stage score and instructor feedback.</p>
            </div>}
          </div>

          <section className="space-y-4 rounded-xl border border-[#202631] bg-[#171d28]/60 p-4" aria-label={`${activeStage.title} stage rubric`}>
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#293343] pb-3">
              <div>
                <h3 className="text-sm font-semibold text-stone-100">Stage Rubric</h3>
                <p className="mt-1 text-[10px] text-stone-500">Choose a scoring scale for {activeStage.title}, then rate each criterion.</p>
              </div>
              <label className="flex items-center gap-2 text-xs text-stone-400">
                Scoring scale
                <select
                  value={stageRubricScales[activeStage.id] || DEFAULT_RUBRIC_SCALE}
                  onChange={(event) => {
                    const nextScale = event.target.value as RubricScale;
                    const currentScale = stageRubricScales[activeStage.id];
                    updateEvaluation({
                      stageRubricScales: { ...stageRubricScales, [activeStage.id]: nextScale },
                      stageScores: {
                        ...stageScores,
                        [activeStage.id]: Object.fromEntries(
                          Object.entries(stageScores[activeStage.id] || {}).map(([criterionId, score]) => [
                            criterionId,
                            convertRubricScore(score, currentScale, nextScale),
                          ]),
                        ),
                      },
                    });
                  }}
                  className="rounded-md border border-[#394252] bg-[#0c1017] px-2.5 py-2 text-xs text-stone-200 outline-none focus:border-amber-500/40"
                  aria-label={`${activeStage.title} rubric scoring scale`}
                >
                  {RUBRIC_SCALE_OPTIONS.map((scale) => <option key={scale.id} value={scale.id}>{scale.label}</option>)}
                </select>
              </label>
            </div>
            <div className="divide-y divide-[#293343]">
              {STAGE_RUBRIC_CRITERIA.map((criterion) => {
                const scale = getRubricScale(stageRubricScales[activeStage.id]);
                const score = stageScores[activeStage.id]?.[criterion.id];
                return <div key={criterion.id} className="grid gap-2 py-3 sm:grid-cols-[minmax(180px,0.8fr)_minmax(0,2fr)_96px] sm:items-center">
                  <label htmlFor={`stage-score-${activeStage.id}-${criterion.id}`} className="text-xs font-medium text-stone-300">{criterion.label}</label>
                  <input
                    id={`stage-score-${activeStage.id}-${criterion.id}`}
                    type="range"
                    min={scale.min}
                    max={scale.max}
                    step={scale.step}
                    value={score ?? scale.min}
                    onChange={(event) => updateEvaluation({
                      stageScores: {
                        ...stageScores,
                        [activeStage.id]: { ...stageScores[activeStage.id], [criterion.id]: Number(event.target.value) },
                      },
                    })}
                    className="w-full accent-amber-500"
                    aria-label={`${activeStage.title} ${criterion.label}`}
                  />
                  <div className="flex items-center gap-2 sm:justify-end">
                    <input
                      type="number"
                      min={scale.min}
                      max={scale.max}
                      step={scale.step}
                      value={score ?? ""}
                      onChange={(event) => {
                        const value = event.target.value === "" ? undefined : Number(event.target.value);
                        if (value === undefined || (Number.isFinite(value) && value >= scale.min && value <= scale.max)) {
                          updateEvaluation({
                            stageScores: {
                              ...stageScores,
                              [activeStage.id]: value === undefined
                                ? Object.fromEntries(Object.entries(stageScores[activeStage.id] || {}).filter(([id]) => id !== criterion.id))
                                : { ...stageScores[activeStage.id], [criterion.id]: value },
                            },
                          });
                        }
                      }}
                      className="rubric-score-input w-full rounded-md border border-[#394252] bg-[#0c1017] px-3 py-2 text-center text-xs text-amber-300 outline-none transition-colors hover:border-amber-500/30 focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20"
                      aria-label={`${activeStage.title} ${criterion.label} score value`}
                    />
                    <span className="text-[10px] text-stone-500">{score === undefined ? "—" : `/${scale.max}`}</span>
                  </div>
                </div>;
              })}
            </div>
            <label className="block border-t border-[#293343] pt-3 text-xs font-medium text-stone-300">Stage feedback
              <textarea value={stageFeedback[activeStage.id] || ""} onChange={(event) => updateEvaluation({ stageFeedback: { ...stageFeedback, [activeStage.id]: event.target.value } })} rows={3} placeholder={`Comments on ${activeStage.title.toLowerCase()}...`} className="mt-1 w-full resize-y rounded-md border border-[#394252] bg-[#0c1017] p-3 text-xs font-normal leading-relaxed text-stone-200 outline-none focus:border-amber-500/40" />
            </label>
            {(activeStage.id === "listening" || activeStage.id === "speaking") && <div className="space-y-2 border-t border-[#293343] pt-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-stone-200"><Mic className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />Audio feedback note</div>
              <AudioRecorder onBlob={(blob) => { void uploadStageVoiceNote(activeStage.id, blob); }} onError={setVoiceUploadError} disabled={voiceUploadStage === activeStage.id || isSubmitting} label={`Record ${activeStage.title.toLowerCase()} feedback`} />
              <label className="block text-[10px] text-stone-400">Or attach an audio file
                <input type="file" accept="audio/*" disabled={voiceUploadStage === activeStage.id || isSubmitting} onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file && !file.type.startsWith("audio/")) { setVoiceUploadError("Choose a valid audio file."); } else if (file) { void uploadStageVoiceNote(activeStage.id, file); } event.currentTarget.value = ""; }} className="mt-1 block w-full text-[10px] text-stone-400 file:mr-2 file:rounded file:border-0 file:bg-[#293343] file:px-2 file:py-1.5 file:text-[10px] file:text-stone-200" />
              </label>
              {voiceUploadStage === activeStage.id && <p role="status" className="text-[10px] text-amber-300">Uploading voice note...</p>}
              {voiceUploadError && <p role="alert" className="text-[10px] text-red-300">{voiceUploadError}</p>}
              {stageVoiceFeedback[activeStage.id] && <div className="space-y-2">
                <CustomAudioPlayer src={stageVoiceFeedback[activeStage.id]} label={`${activeStage.title} instructor voice note`} />
                <button type="button" onClick={() => updateEvaluation({ stageVoiceFeedback: { ...stageVoiceFeedback, [activeStage.id]: "" } })} className="text-[10px] text-stone-500 underline hover:text-red-300">Remove voice note</button>
              </div>}
            </div>}
          </section>
        </div> : null}

        {feedbackError && <p role="alert" className="rounded-lg border border-red-700 bg-red-900/30 p-3 text-xs text-red-200">{feedbackError}</p>}
        {draftStatus && <p role="status" className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-300">{draftStatus}</p>}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#202631] pt-4">
          <button type="button" onClick={() => changeActiveStage(activeStageIndex <= 0 ? reportStageId : activeStageIndex === reportStageIndex ? stages[stages.length - 1]?.id || reportStageId : stages[activeStageIndex - 1]?.id || reportStageId)} disabled={activeStageIndex <= 0} className="inline-flex items-center gap-2 rounded-md border border-[#394252] px-3 py-2 text-xs text-stone-300 transition hover:border-amber-500/40 disabled:cursor-not-allowed disabled:opacity-40">
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />Previous Stage
          </button>
          <button type="button" onClick={() => changeActiveStage(activeStageIndex >= reportStageIndex ? reportStageId : activeStageIndex === reportStageIndex - 1 ? reportStageId : stages[activeStageIndex + 1]?.id || reportStageId)} disabled={activeStageIndex >= reportStageIndex} className="inline-flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-40">
            Next Stage<ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
        {activeStageId === reportStageId && <button type="button" onClick={() => void handleSubmit()} disabled={isSubmitting || isSubmitted || voiceUploadStage !== null || (useSupabase && submissionLoadState !== "loaded")} className="w-full rounded-lg bg-amber-500/20 px-6 py-3 text-sm font-semibold text-amber-300 transition hover:bg-amber-500/30 disabled:cursor-wait disabled:opacity-50">
          {isSubmitting ? "Publishing..." : isSubmitted ? "Evaluation Published" : "Publish Evaluation & Send to Student"}
        </button>}
      </section>
    </div>
  </div>;
}

export default SubmissionEvaluator;
