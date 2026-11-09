"use client";

import React, { useEffect, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ClipboardCheck, Mic, Pin, Save, Settings2, Sparkles, Star, X } from "lucide-react";
import { LessonEvaluation } from "@/types/lesson";
import { getInstructorSubmissionData, saveInstructorEvaluation } from "@/lib/evaluations";
import { uploadVoiceFeedback } from "@/services/storage-service";
import { CustomAudioPlayer } from "@/components/study-room/custom-audio-player";
import { AudioRecorder } from "@/components/shared/audio-recorder";
import { TiptapEditor } from "@/components/shared/tiptap-editor";
import { type UnifiedReportStage } from "@/components/shared/unified-report-card";
import { combineTaskFeedback } from "@/lib/evaluation-feedback";
import {
  type RubricScale,
  DEFAULT_RUBRIC_SCALE,
  RUBRIC_SCALE_OPTIONS,
  aggregateOverallRubric,
  calculateStageOverallScore,
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
  globalRubricScale: RubricScale;
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
  usePostgres?: boolean;
}

const RUBRIC_CRITERIA = [
  { id: "task", label: "Task Achievement & Depth", max: 5 },
  { id: "coherence", label: "Coherence & Flow", max: 5 },
  { id: "lexical", label: "Lexical Precision & Range", max: 5 },
  { id: "grammar", label: "Grammatical Accuracy", max: 5 },
];
const STAGE_RUBRIC_CRITERIA = RUBRIC_CRITERIA;
const MAX_INSTRUCTOR_PROMPT_LENGTH = 2500;
const MAX_ACADEMIS_TASK_PROMPT_LENGTH = 6000;
const MAX_ACADEMIS_TASK_TITLE_LENGTH = 300;
const MAX_ACADEMIS_RESPONSE_LENGTH = 12000;
const ACADEMIS_PROMPTS = [
  {
    id: "balanced",
    label: "Balanced review",
    prompt: "Assess the submission against the rubric. Highlight evidence for each score, note the strongest area and one practical next step, and keep the tone constructive.",
  },
  {
    id: "language",
    label: "Language focus",
    prompt: "Focus on grammatical accuracy, lexical precision, and natural phrasing. Explain recurring patterns with brief examples and prioritize the most useful corrections.",
  },
  {
    id: "encouraging",
    label: "Encouraging summary",
    prompt: "Write an encouraging, student-friendly summary of demonstrated strengths and the next learning goal. Be specific, supportive, and concise.",
  },
] as const;
const DEFAULT_ACADEMIS_CATEGORIES = ACADEMIS_PROMPTS.map(({ id, label }) => ({ id, label }));
interface AcademisPromptPreset {
  id: string;
  label: string;
  prompt: string;
  categoryId: string;
  isFavorite: boolean;
}

interface AcademisPromptCategory {
  id: string;
  label: string;
}

interface AcademisInsight {
  criteria_scores: {
    task: number;
    coherence: number;
    lexical: number;
    grammar: number;
  };
  overall_band_score: number;
  student_summary: string;
  instructor_diagnostic: {
    key_error_patterns: Array<{
      pattern: string;
      example: string;
      lesson_adjustment: string;
    }>;
    targeted_resources: Array<{
      topic: string;
      title: string;
      reason: string;
    }>;
    teaching_notes: string;
  };
}

type AcademisResultTab = "student-summary" | "instructor-diagnostic";

interface AcademisEvaluationContext {
  taskId: string;
  stageId: string;
  stageTitle: string;
  taskTitle: string;
  taskPrompt: string;
  studentResponse: string;
  instructorPrompt: string;
}

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isAcademisInsight(value: unknown): value is AcademisInsight {
  if (!isRecord(value)
    || !isRecord(value.criteria_scores)
    || !isRecord(value.instructor_diagnostic)
    || typeof value.overall_band_score !== "number"
    || !Number.isFinite(value.overall_band_score)
    || value.overall_band_score < 1
    || value.overall_band_score > 9
    || typeof value.student_summary !== "string"
    || !Array.isArray(value.instructor_diagnostic.key_error_patterns)
    || !Array.isArray(value.instructor_diagnostic.targeted_resources)
    || typeof value.instructor_diagnostic.teaching_notes !== "string") {
    return false;
  }
  const criteriaScores = value.criteria_scores;
  if (!["task", "coherence", "lexical", "grammar"].every((criterion) => {
    const score = criteriaScores[criterion];
    return typeof score === "number" && Number.isInteger(score) && score >= 1 && score <= 9;
  })) return false;
  return value.instructor_diagnostic.key_error_patterns.every((pattern) =>
    isRecord(pattern)
      && typeof pattern.pattern === "string"
      && typeof pattern.example === "string"
      && typeof pattern.lesson_adjustment === "string")
    && value.instructor_diagnostic.targeted_resources.every((resource) =>
      isRecord(resource)
        && typeof resource.topic === "string"
        && typeof resource.title === "string"
        && typeof resource.reason === "string");
}

function normalizeAnswer(value: string) {
  return value.trim().toLowerCase().replace(/^[a-z]\s*[).]\s*/, "").trim();
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
  usePostgres = true,
}: SubmissionEvaluatorProps) {
  const comments = evaluation?.comments || "";
  const criterionFeedback = evaluation?.criterionFeedback || {};
  const stageFeedback = evaluation?.stageFeedback || {};
  const stageScores = evaluation?.stageScores || {};
  const stageRubricScales = evaluation?.stageRubricScales || {};
  const globalRubricScale = evaluation?.globalRubricScale || DEFAULT_RUBRIC_SCALE;
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
  const [activeTaskId, setActiveTaskId] = useState(stages[0]?.tasks[0]?.id || "");
  const [expandedTaskFeedback, setExpandedTaskFeedback] = useState<Record<string, boolean>>({});
  const [isEvaluationSidebarCollapsed, setIsEvaluationSidebarCollapsed] = useState(false);
  const [isAcademisSidebarCollapsed, setIsAcademisSidebarCollapsed] = useState(false);
  const [academisPrompt, setAcademisPrompt] = useState<string>(ACADEMIS_PROMPTS[0].prompt);
  const [academisPresets, setAcademisPresets] = useState<AcademisPromptPreset[]>(
    ACADEMIS_PROMPTS.map((preset) => ({
      ...preset,
      categoryId: preset.id,
      isFavorite: false,
    })),
  );
  const [academisCategories, setAcademisCategories] = useState<AcademisPromptCategory[]>(DEFAULT_ACADEMIS_CATEGORIES);
  const [academisPresetDrafts, setAcademisPresetDrafts] = useState<AcademisPromptPreset[]>([]);
  const [academisCategoryDrafts, setAcademisCategoryDrafts] = useState<AcademisPromptCategory[]>([]);
  const [activeAcademisCategoryId, setActiveAcademisCategoryId] = useState<string>(ACADEMIS_PROMPTS[0].id);
  const [isAcademisLibraryOpen, setIsAcademisLibraryOpen] = useState(false);
  const [academisLibraryError, setAcademisLibraryError] = useState<string | null>(null);
  const [activeAcademisPresetId, setActiveAcademisPresetId] = useState<string>(ACADEMIS_PROMPTS[0].id);
  const [academisInsight, setAcademisInsight] = useState<{
    context: AcademisEvaluationContext;
    result: AcademisInsight;
    stored: boolean;
  } | null>(null);
  const [academisResultsByTask, setAcademisResultsByTask] = useState<Record<string, {
    context: AcademisEvaluationContext;
    result: AcademisInsight;
    stored: boolean;
  }>>({});
  const [academisLoadedStages, setAcademisLoadedStages] = useState<Record<string, boolean>>({});
  const [academisRequestContext, setAcademisRequestContext] = useState<AcademisEvaluationContext | null>(null);
  const [isAcademisResultOpen, setIsAcademisResultOpen] = useState(false);
  const [academisResultTab, setAcademisResultTab] = useState<AcademisResultTab>("student-summary");
  const [academisStudentSummary, setAcademisStudentSummary] = useState("");
  const [academisApplyNotice, setAcademisApplyNotice] = useState<string | null>(null);
  const [isAcademisLoading, setIsAcademisLoading] = useState(false);
  const [academisError, setAcademisError] = useState<string | null>(null);
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
  >(usePostgres ? "idle" : "loaded");

  useEffect(() => {
    if (activeStageId === "report-card") return;
    const stage = stages.find((item) => item.id === activeStageId);
    if (!stage) {
      const primaryStage = stages[0];
      if (primaryStage) {
        setActiveStageId(primaryStage.id);
        setActiveTaskId(primaryStage.tasks[0]?.id || "");
      }
      return;
    }
    if (!stage.tasks.some((task) => task.id === activeTaskId)) {
      setActiveTaskId(stage.tasks[0]?.id || "");
    }
  }, [stages, activeStageId, activeTaskId]);

  useEffect(() => {
    try {
      const savedPresets = window.localStorage.getItem(`fluentia:academis-presets:${instructorId || "default"}`);
      if (!savedPresets) return;
      const parsed: unknown = JSON.parse(savedPresets);
      const savedCategories = Array.isArray(parsed)
        ? DEFAULT_ACADEMIS_CATEGORIES
        : parsed && typeof parsed === "object" && "categories" in parsed && Array.isArray(parsed.categories)
          ? parsed.categories
          : null;
      const savedPresetList = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === "object" && "presets" in parsed && Array.isArray(parsed.presets)
          ? parsed.presets
          : null;
      if (!savedCategories
        || !savedCategories.length
        || !savedCategories.every((category) => category
          && typeof category === "object"
          && typeof category.id === "string"
          && typeof category.label === "string")
        || !savedPresetList
        || !savedPresetList.every((preset) => preset
          && typeof preset === "object"
          && typeof preset.id === "string"
          && typeof preset.label === "string"
          && typeof preset.prompt === "string")) {
        throw new Error("Saved Academis prompt library has an invalid format.");
      }

      const categories = savedCategories.map((category) => ({
        id: category.id.trim(),
        label: category.label.trim(),
      })).filter((category) => category.id && category.label);
      const categoryIds = new Set(categories.map((category) => category.id));
      const presets: AcademisPromptPreset[] = savedPresetList.map((preset) => {
        const categoryId = "categoryId" in preset && typeof preset.categoryId === "string" && categoryIds.has(preset.categoryId)
          ? preset.categoryId
          : categoryIds.has(preset.id) ? preset.id : categories[0].id;
        return {
          id: preset.id.trim(),
          label: preset.label.trim(),
          prompt: preset.prompt.trim(),
          categoryId,
          isFavorite: "isFavorite" in preset && preset.isFavorite === true,
        };
      }).filter((preset) => preset.id && preset.label && preset.prompt);
      if (categories.length && presets.length) {
        setAcademisCategories(categories);
        setAcademisPresets(presets);
        const selected = presets.find((preset) => preset.isFavorite) || presets[0];
        setActiveAcademisCategoryId(selected.categoryId);
        setActiveAcademisPresetId(selected.id);
        setAcademisPrompt(selected.prompt);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load saved Academis prompts.";
      setAcademisError(message);
      console.error("Academis prompt library could not be loaded:", error);
    }
  }, [instructorId]);

  useEffect(() => {
    if (!isAcademisLibraryOpen && !isAcademisResultOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsAcademisLibraryOpen(false);
        setIsAcademisResultOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isAcademisLibraryOpen, isAcademisResultOpen]);

  useEffect(() => {
    if (!academisApplyNotice) return;
    const timeoutId = window.setTimeout(() => setAcademisApplyNotice(null), 3200);
    return () => window.clearTimeout(timeoutId);
  }, [academisApplyNotice]);

  // Load the instructor's submission and saved evaluation through the authenticated API.
  useEffect(() => {
    if (usePostgres && lessonId?.trim() && studentId?.trim()) {
      loadSubmissionData();
    }
  }, [lessonId, studentId, pendingSubmissionId, usePostgres]);

  const loadSubmissionData = async () => {
    const normalizedLessonId = lessonId?.trim() || "";
    const normalizedStudentId = studentId?.trim() || "";
    setSubmitError(null);
    if (!UUID_PATTERN.test(normalizedLessonId)
      || !UUID_PATTERN.test(normalizedStudentId)
      || (pendingSubmissionId !== undefined && !UUID_PATTERN.test(pendingSubmissionId))) {
      setSubmissionId(null);
      setSubmissionLoadState("missing");
      return;
    }
    setSubmissionId(null);
    setSubmissionLoadState("loading");
    try {
      const result = await getInstructorSubmissionData(
        normalizedLessonId,
        normalizedStudentId,
        pendingSubmissionId,
      );
      const submission = result.submission;
      if (submission) {
        setSubmissionId(submission.id);
        setSubmissionLoadState("loaded");
      } else {
        setSubmissionId(null);
        setSubmissionLoadState("missing");
      }
      const feedback = result.publishedFeedback;
      if (result.draftEvaluation) {
        onUpdateEvaluation?.({ ...result.draftEvaluation, published: false });
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
          globalRubricScale: feedback.criterion_feedback?.globalRubricScale || evaluation?.globalRubricScale || DEFAULT_RUBRIC_SCALE,
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
      const message = error instanceof Error ? error.message : "Unable to load this submission.";
      setSubmitError(message);
      console.error("Student submission could not be refreshed:", error);
    }
  };

  const handleScoreChange = (id: string, val: number) => {
    const normalizedScore = normalizeRubricScore(val, overallScaleId);
    updateEvaluation({
      scores: { ...scores, [id]: normalizedScore },
      reportCardScoreOverrides: { ...reportCardScoreOverrides, [id]: normalizedScore },
    });
  };

  const handleGlobalScaleChange = (nextScale: RubricScale) => {
    const nextStageRubricScales = { ...stageRubricScales };
    const nextStageScores = { ...stageScores };
    for (const stage of stages) {
      const currentScale = stageRubricScales[stage.id] || globalRubricScale;
      nextStageRubricScales[stage.id] = nextScale;
      nextStageScores[stage.id] = Object.fromEntries(
        Object.entries(stageScores[stage.id] || {}).map(([criterionId, score]) => [
          criterionId,
          convertRubricScore(score, currentScale, nextScale),
        ]),
      );
    }
    updateEvaluation({
      globalRubricScale: nextScale,
      stageRubricScales: nextStageRubricScales,
      stageScores: nextStageScores,
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
      globalRubricScale,
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
  const activeTask = activeStage?.tasks.find((task) => task.id === activeTaskId) || activeStage?.tasks[0];
  const activeStageTaskSignature = activeStage?.tasks.map((task) => task.id).join("|") || "";
  const activeAcademisCacheKey = submissionId && activeStage && activeTask
    ? JSON.stringify([submissionId, activeStage.id, activeTask.id])
    : null;
  const hasCachedAcademisResult = activeAcademisCacheKey
    ? Boolean(academisResultsByTask[activeAcademisCacheKey])
    : false;
  const activeTaskPrompt = activeTask?.prompt?.trim()
    || activeTask?.title?.trim()
    || activeStage?.prompt?.trim()
    || "";

  useEffect(() => {
    if (!submissionId || !activeStage || !activeStage.tasks.length) return;
    const stageCacheKey = JSON.stringify([submissionId, activeStage.id]);
    if (academisLoadedStages[stageCacheKey]) return;
    const controller = new AbortController();
    const loadStageReports = async () => {
      try {
        const params = new URLSearchParams({ submissionId, stageId: activeStage.id });
        const response = await fetch(`/api/instructor/academis?${params}`, {
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Unable to load saved Academis reports.");
        const payload: { insights?: unknown } = await response.json();
        const restoredResults: Record<string, { context: AcademisEvaluationContext; result: AcademisInsight; stored: boolean }> = {};
        if (Array.isArray(payload.insights)) {
          for (const savedReport of payload.insights) {
            if (!isRecord(savedReport)
              || typeof savedReport.taskId !== "string"
              || !isAcademisInsight(savedReport.insight)) continue;
            const task = activeStage.tasks.find((candidate) => candidate.id === savedReport.taskId);
            if (!task) continue;
            const taskPrompt = task.prompt?.trim() || task.title?.trim() || activeStage.prompt?.trim() || "";
            const context: AcademisEvaluationContext = {
              taskId: task.id,
              stageId: activeStage.id,
              stageTitle: activeStage.title,
              taskTitle: (task.title?.trim() || taskPrompt).slice(0, MAX_ACADEMIS_TASK_TITLE_LENGTH),
              taskPrompt: taskPrompt.slice(0, MAX_ACADEMIS_TASK_PROMPT_LENGTH),
              studentResponse: (task.studentAnswer?.trim()
                || (task.audioUrls?.length
                  ? "Audio response submitted; transcript unavailable for grading."
                  : "No written response submitted.")).slice(0, MAX_ACADEMIS_RESPONSE_LENGTH),
              instructorPrompt: "",
            };
            const cacheKey = JSON.stringify([submissionId, activeStage.id, task.id]);
            restoredResults[cacheKey] = { context, result: savedReport.insight, stored: true };
          }
        }
        setAcademisResultsByTask((current) => {
          const next = { ...current };
          for (const [cacheKey, result] of Object.entries(restoredResults)) {
            if (!next[cacheKey]) next[cacheKey] = result;
          }
          return next;
        });
      } catch (error) {
        if (!controller.signal.aborted) {
          console.warn("Saved Academis reports are unavailable; session results remain available:", error);
        }
      } finally {
        if (!controller.signal.aborted) {
          setAcademisLoadedStages((loaded) => ({ ...loaded, [stageCacheKey]: true }));
        }
      }
    };
    void loadStageReports();
    return () => controller.abort();
  }, [submissionId, activeStageId, activeStageTaskSignature, academisLoadedStages]);
  const activeAcademisPreset = academisPresets.find((preset) => preset.id === activeAcademisPresetId);
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
    globalRubricScale,
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
      } else if (usePostgres && lessonId && studentId && submissionId) {
        await saveInstructorEvaluation(
          submissionId,
          { ...evaluation, ...payload, published: false } as LessonEvaluation,
          false,
        );
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
    if (!onSubmitFeedback && (!usePostgres || !lessonId || !studentId || !submissionId)) {
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
        globalRubricScale,
        reportCardScoreOverrides,
        taskFeedback,
        inlineCorrections,
        stageVoiceFeedback,
        published: true,
      };
      if (onSubmitFeedback) {
        await onSubmitFeedback({ ...payload, totalScore });
      } else {
        await saveInstructorEvaluation(submissionId!, publishedEvaluation, true);
      }

      setIsSubmitted(true);
      onUpdateEvaluation?.(publishedEvaluation);
      setPublishNotice({ type: "success", message: "Evaluation successfully published and sent to the student." });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to submit evaluation";
      setSubmitError(errorMessage);
      setPublishNotice({ type: "error", message: errorMessage });
      console.error("Error submitting evaluation:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const changeActiveStage = (stageId: string) => {
    setActiveStageId(stageId);
    setActiveTaskId(stages.find((stage) => stage.id === stageId)?.tasks[0]?.id || "");
    setAcademisInsight(null);
    setAcademisError(null);
    setVoiceUploadError(null);
  };
  const stageStatusClass = (status: string) => status === "Evaluated"
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
    : status === "In progress"
      ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
      : "border-border bg-surface text-stone-500";
  const feedbackError = submitError || (usePostgres && submissionLoadState === "missing" ? "Student has not submitted work for this lesson yet." : null);
  const stageStepper = <div className="w-full min-w-0 overflow-x-auto border-b border-border">
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
  const stageHeading = <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-amber-400">{activeStageId === reportStageId ? "Final review" : `Stage ${String(activeStageIndex + 1).padStart(2, "0")} of 07`}</p>
      <h2 className="mt-1 text-xl font-semibold text-stone-100">{activeStageTitle}</h2>
    </div>
    {activeStageId !== reportStageId && activeStage && <span className={`rounded-full border px-2.5 py-1 text-[10px] ${stageStatusClass(evaluationStatus(activeStage.id))}`}>{evaluationStatus(activeStage.id)}</span>}
  </header>;
  const generateAcademisInsight = async (forceRefresh = false) => {
    const selectedStage = stages.find((stage) => stage.id === activeStageId);
    const selectedTask = selectedStage?.tasks.find((task) => task.id === activeTaskId)
      || selectedStage?.tasks[0];
    const taskPrompt = selectedTask?.prompt?.trim()
      || selectedTask?.title?.trim()
      || selectedStage?.prompt?.trim()
      || "";
    if (!submissionId || !UUID_PATTERN.test(submissionId)) {
      setAcademisError("Wait for the student submission to finish loading, then try again.");
      return;
    }
    if (!selectedStage || !/^[a-z0-9_-]{1,80}$/i.test(selectedStage.id)) {
      setAcademisError("Select a valid evaluation stage before running Academis.");
      return;
    }
    if (!selectedTask || !selectedTask.id || selectedTask.id.length > 200) {
      setAcademisError("Select a task from the current stage before running Academis.");
      return;
    }
    if (!taskPrompt) {
      setAcademisError("The selected task has no prompt for Academis to evaluate.");
      return;
    }
    const studentResponse = selectedTask.studentAnswer?.trim()
      || (selectedTask.audioUrls?.length
        ? "Audio response submitted; transcript unavailable for grading."
        : "No written response submitted.");
    const requestTaskTitle = (selectedTask.title?.trim() || taskPrompt)
      .slice(0, MAX_ACADEMIS_TASK_TITLE_LENGTH);
    const requestTaskPrompt = taskPrompt.slice(0, MAX_ACADEMIS_TASK_PROMPT_LENGTH);
    const requestStudentResponse = studentResponse.slice(0, MAX_ACADEMIS_RESPONSE_LENGTH);
    const evaluationContext: AcademisEvaluationContext = {
      taskId: selectedTask.id,
      stageId: selectedStage.id,
      stageTitle: selectedStage.title.slice(0, 120),
      taskTitle: requestTaskTitle,
      taskPrompt: requestTaskPrompt,
      studentResponse: requestStudentResponse,
      instructorPrompt: academisPrompt.slice(0, MAX_INSTRUCTOR_PROMPT_LENGTH),
    };
    const cacheKey = JSON.stringify([submissionId, selectedStage.id, selectedTask.id]);
    const cachedResult = academisResultsByTask[cacheKey];
    if (cachedResult && !forceRefresh) {
      setAcademisInsight(cachedResult);
      setAcademisRequestContext(cachedResult.context);
      setAcademisStudentSummary(cachedResult.result.student_summary);
      setAcademisApplyNotice(null);
      setAcademisError(null);
      setAcademisResultTab("student-summary");
      setIsAcademisResultOpen(true);
      return;
    }

    setIsAcademisLoading(true);
    setAcademisError(null);
    setAcademisInsight(null);
    setAcademisRequestContext(evaluationContext);
    setAcademisStudentSummary("");
    setAcademisApplyNotice(null);
    setAcademisResultTab("student-summary");
    setIsAcademisResultOpen(true);
    try {
      const response = await fetch("/api/instructor/academis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          submissionId,
          stageId: evaluationContext.stageId,
          stageTitle: evaluationContext.stageTitle,
          taskId: selectedTask.id,
          taskTitle: evaluationContext.taskTitle,
          taskPrompt: evaluationContext.taskPrompt,
          studentResponse: evaluationContext.studentResponse,
          instructorPrompt: evaluationContext.instructorPrompt,
          rubricScores: Object.fromEntries(
            RUBRIC_CRITERIA.map(({ id }) => [id, stageScores[selectedStage.id]?.[id] ?? null]),
          ),
        }),
      });
      let payload: { error?: string; insight?: unknown; insightSaved?: boolean };
      try {
        payload = await response.json() as { error?: string; insight?: unknown; insightSaved?: boolean };
      } catch {
        throw new Error("Academis returned an invalid response.");
      }
      if (!response.ok) throw new Error(payload.error || "Academis could not complete the grading request.");
      if (!isAcademisInsight(payload.insight)) {
        throw new Error("Academis returned an incomplete grading result.");
      }
      const completedResult = { context: evaluationContext, result: payload.insight, stored: payload.insightSaved === true };
      setAcademisInsight(completedResult);
      setAcademisResultsByTask((results) => ({ ...results, [cacheKey]: completedResult }));
      setAcademisStudentSummary(payload.insight.student_summary);
    } catch (error) {
      setAcademisError(error instanceof Error ? error.message : "Academis could not complete the grading request.");
    } finally {
      setIsAcademisLoading(false);
    }
  };
  const openAcademisLibrary = () => {
    setAcademisPresetDrafts(academisPresets.map((preset) => ({ ...preset })));
    setAcademisCategoryDrafts(academisCategories.map((category) => ({ ...category })));
    setActiveAcademisCategoryId(academisCategories[0]?.id || "");
    setAcademisLibraryError(null);
    setIsAcademisLibraryOpen(true);
  };
  const deleteAcademisCategory = (categoryId: string) => {
    if (DEFAULT_ACADEMIS_CATEGORIES.some((category) => category.id === categoryId)) return;
    const categories = academisCategoryDrafts.filter((category) => category.id !== categoryId);
    const fallbackCategoryId = categories.find((category) => DEFAULT_ACADEMIS_CATEGORIES.some((defaultCategory) => defaultCategory.id === category.id))?.id
      || categories[0]?.id;
    if (!fallbackCategoryId) return;
    const defaultPresetIds = new Set<string>(ACADEMIS_PROMPTS.map((preset) => preset.id));
    setAcademisCategoryDrafts(categories);
    setAcademisPresetDrafts((presets) => presets.flatMap((preset) => {
      if (preset.categoryId !== categoryId) return [preset];
      return defaultPresetIds.has(preset.id) ? [{ ...preset, categoryId: fallbackCategoryId }] : [];
    }));
    setActiveAcademisCategoryId((activeCategoryId) => activeCategoryId === categoryId ? fallbackCategoryId : activeCategoryId);
    setAcademisLibraryError(null);
  };
  const saveAcademisLibrary = () => {
    const presets = academisPresetDrafts.map((preset) => ({
      ...preset,
      label: preset.label.trim(),
      prompt: preset.prompt.trim(),
    }));
    const categories = academisCategoryDrafts.map((category) => ({
      ...category,
      label: category.label.trim(),
    }));
    if (!categories.length
      || categories.some((category) => !category.label || category.label.length > 40)
      || new Set(categories.map((category) => category.id)).size !== categories.length
      || new Set(categories.map((category) => category.label.toLowerCase())).size !== categories.length) {
      setAcademisLibraryError("Give each category a unique title.");
      return;
    }
    if (!presets.length || presets.some((preset) => !preset.label
      || preset.label.length > 40
      || !preset.prompt
      || preset.prompt.length > MAX_INSTRUCTOR_PROMPT_LENGTH
      || !categories.some((category) => category.id === preset.categoryId))) {
      setAcademisLibraryError("Add a title and prompt to each preset and assign it to a category.");
      return;
    }
    if (new Set(presets.map((preset) => preset.id)).size !== presets.length
      || new Set(presets.map((preset) => preset.label.toLowerCase())).size !== presets.length) {
      setAcademisLibraryError("Preset titles must be unique.");
      return;
    }
    if (presets.filter((preset) => preset.isFavorite).length > 3) {
      setAcademisLibraryError("Pin no more than 3 presets.");
      return;
    }
    try {
      window.localStorage.setItem(
        `fluentia:academis-presets:${instructorId || "default"}`,
        JSON.stringify({ categories, presets }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save the Academis prompt library.";
      setAcademisLibraryError(`Could not save your prompts: ${message}`);
      console.error("Academis prompt library could not be saved:", error);
      return;
    }
    setAcademisPresets(presets);
    setAcademisCategories(categories);
    const selectedPreset = presets.find((preset) => preset.id === activeAcademisPresetId)
      || presets.find((preset) => preset.isFavorite)
      || presets[0];
    if (selectedPreset) {
      setActiveAcademisPresetId(selectedPreset.id);
      setAcademisPrompt(selectedPreset.prompt);
      setActiveAcademisCategoryId(selectedPreset.categoryId);
    }
    setIsAcademisLibraryOpen(false);
  };
  const pinnedAcademisPresets = academisPresets.filter((preset) => preset.isFavorite).slice(0, 3);

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
    <div className={`grid min-w-0 items-start gap-5 transition-[grid-template-columns] duration-300 ease-in-out ${
      isEvaluationSidebarCollapsed
        ? isAcademisSidebarCollapsed
          ? "lg:grid-cols-[3.5rem_minmax(0,1fr)] xl:grid-cols-[3.5rem_minmax(0,1fr)_3.5rem]"
          : "lg:grid-cols-[3.5rem_minmax(0,1fr)] xl:grid-cols-[3.5rem_minmax(0,1fr)_320px]"
        : isAcademisSidebarCollapsed
          ? "lg:grid-cols-[250px_minmax(0,1fr)] xl:grid-cols-[250px_minmax(0,1fr)_3.5rem]"
          : "lg:grid-cols-[250px_minmax(0,1fr)] xl:grid-cols-[250px_minmax(0,1fr)_320px]"
    }`}>
      <aside className={`flex min-w-0 flex-col rounded-xl border border-border bg-surface transition-[padding] duration-300 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] ${isEvaluationSidebarCollapsed ? "p-2" : "p-4"}`} aria-label="Evaluation tools">
        <div className={`flex shrink-0 items-center ${isEvaluationSidebarCollapsed ? "justify-center" : "justify-between gap-2"}`}>
          {!isEvaluationSidebarCollapsed && <div className="min-w-0">
            <p className="truncate text-[10px] font-semibold uppercase tracking-[0.15em] text-amber-400">Evaluation Studio</p>
            <h2 className="mt-1 truncate text-sm font-semibold text-stone-100">{studentName}</h2>
          </div>}
          <button
            type="button"
            onClick={() => setIsEvaluationSidebarCollapsed((collapsed) => !collapsed)}
            aria-label={isEvaluationSidebarCollapsed ? "Expand evaluation sidebar" : "Collapse evaluation sidebar"}
            aria-expanded={!isEvaluationSidebarCollapsed}
            aria-controls="evaluation-sidebar-content"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-border text-stone-300 transition hover:border-amber-500/40 hover:text-amber-400"
          >
            {isEvaluationSidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>
        <div id="evaluation-sidebar-content" hidden={isEvaluationSidebarCollapsed} className={`mt-4 min-h-0 flex-1 flex-col ${isEvaluationSidebarCollapsed ? "hidden" : "flex"}`}>
          <label className="block text-xs text-stone-400">
            <span className="mb-1.5 block font-medium text-stone-300">Scoring Scale</span>
            <select
              value={globalRubricScale}
              onChange={(event) => handleGlobalScaleChange(event.target.value as RubricScale)}
              className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-xs text-stone-200 outline-none focus:border-amber-500/40"
              aria-label="Global scoring scale for all stages"
            >
              {RUBRIC_SCALE_OPTIONS.map((scale) => <option key={scale.id} value={scale.id}>{scale.label}</option>)}
            </select>
          </label>
        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto py-4" aria-label="Stage status">
          {stages.map((stage, index) => {
            const status = evaluationStatus(stage.id);
            return <button
              key={stage.id}
              type="button"
              onClick={() => changeActiveStage(stage.id)}
              className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left transition ${activeStageId === stage.id ? "bg-amber-500/10 text-amber-200" : "text-stone-400 hover:bg-surface hover:text-stone-200"}`}
            >
              <span className="min-w-0 truncate text-xs"><span className="mr-2 font-mono text-[10px] text-stone-600">{String(index + 1).padStart(2, "0")}</span>{stage.title}</span>
              <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] ${stageStatusClass(status)}`}>{status}</span>
            </button>;
          })}
          <button
            type="button"
            onClick={() => changeActiveStage(reportStageId)}
            className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left transition ${activeStageId === reportStageId ? "bg-amber-500/10 text-amber-200" : "text-stone-400 hover:bg-surface hover:text-stone-200"}`}
          >
            <span className="text-xs"><span className="mr-2 font-mono text-[10px] text-stone-600">07</span>Report Card</span>
            <span className={`rounded-full border px-1.5 py-0.5 text-[9px] ${stageStatusClass(evaluation?.published ? "Evaluated" : "Pending Review")}`}>{evaluation?.published ? "Evaluated" : "Preview"}</span>
          </button>
        </nav>
        <div className="mt-auto shrink-0 space-y-2 border-t border-border pt-4">
          <button type="button" onClick={() => void handleSaveDraft()} disabled={isSavingDraft || isSubmitting || voiceUploadStage !== null || (usePostgres && submissionLoadState !== "loaded")} className="flex w-full items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-xs text-stone-200 transition hover:border-amber-500/40 disabled:cursor-wait disabled:opacity-50">
            <Save className="h-3.5 w-3.5" aria-hidden="true" />{isSavingDraft ? "Saving Draft..." : "Save Draft"}
          </button>
          <button type="button" onClick={() => changeActiveStage(reportStageId)} className="flex w-full items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-xs text-stone-200 transition hover:border-amber-500/40">
            <ClipboardCheck className="h-3.5 w-3.5" aria-hidden="true" />Jump to Report Card
          </button>
          <button type="button" onClick={() => void handleSubmit()} disabled={isSubmitting || isSubmitted || voiceUploadStage !== null || (usePostgres && submissionLoadState !== "loaded")} className="w-full rounded-md bg-amber-500/20 px-3 py-2.5 text-xs font-semibold text-amber-300 transition hover:bg-amber-500/30 disabled:cursor-wait disabled:opacity-50">
            {isSubmitting ? "Publishing..." : isSubmitted ? "Evaluation Published" : "Publish Evaluation"}
          </button>
          {draftStatus && <p role="status" className="text-[11px] leading-relaxed text-emerald-300">{draftStatus}</p>}
        </div>
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
          <section className="space-y-3 rounded-xl border border-border bg-surface/60 p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-stone-100">Overall Rubric</h3>
              <span className="text-xs text-amber-300">{formatOverallRubricTotal(totalScore, overallScaleId, overallAggregation.totalDenominator)}</span>
            </div>
            <p className="text-[11px] leading-relaxed text-stone-500">Each criterion starts as the average of its ratings across stages. Adjust a score here to fine-tune the final report.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {RUBRIC_CRITERIA.map((criterion) => <div key={criterion.id} className="rounded-lg border border-border bg-background p-3">
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
                    className="rubric-score-input w-16 rounded border border-border bg-surface px-2 py-1 text-center text-xs text-amber-300 outline-none focus:border-amber-500/40"
                    aria-label={`${criterion.label} score value`}
                  />
                </div>
                <textarea value={criterionFeedback[criterion.id] || ""} onChange={(event) => updateEvaluation({ criterionFeedback: { ...criterionFeedback, [criterion.id]: event.target.value } })} rows={2} placeholder={`Feedback for ${criterion.label.toLowerCase()}...`} className="mt-2 w-full resize-y rounded-md border border-border bg-surface p-2 text-xs text-stone-200 outline-none focus:border-amber-500/40" />
              </div>)}
            </div>
          </section>
          {stages.map((stage, index) => <section key={stage.id} className="space-y-3 rounded-xl border border-border bg-surface/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
              <h3 className="text-sm font-semibold text-stone-100">{String(index + 1).padStart(2, "0")} · {stage.title}</h3>
              <span className={`rounded-full border px-2 py-0.5 text-[9px] ${stageStatusClass(evaluationStatus(stage.id))}`}>{evaluationStatus(stage.id)}</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {STAGE_RUBRIC_CRITERIA.map((criterion) => {
                const scale = getRubricScale(stageRubricScales[stage.id]);
                return <label key={criterion.id} className="rounded-md border border-border bg-background p-2 text-[10px] text-stone-400">{criterion.label}<span className="float-right text-amber-300">{formatRubricScore(roundRubricScoreForScale(stageScores[stage.id]?.[criterion.id] || 0, stageRubricScales[stage.id]))}/{scale.max}</span></label>;
              })}
              {(() => {
                const scaleId = stageRubricScales[stage.id];
                const scale = getRubricScale(scaleId);
                const stageOverallScore = calculateStageOverallScore(
                  stageScores[stage.id] || {},
                  STAGE_RUBRIC_CRITERIA.map(({ id }) => id),
                  scaleId,
                );
                return stageOverallScore === undefined ? null : <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-[10px] font-semibold text-amber-200">
                  Stage Overall Score<span className="float-right text-amber-300">{formatRubricScore(stageOverallScore)}/{scale.max}</span>
                </div>;
              })()}
            </div>
            {stageFeedback[stage.id]?.trim() && <p className="whitespace-pre-wrap rounded-md bg-background p-3 text-xs leading-relaxed text-stone-300">{stageFeedback[stage.id]}</p>}
            {stage.tasks.map((task) => <div key={task.id} className="space-y-1 rounded-md border border-border bg-background p-3 text-xs">
              <p className="font-medium text-stone-300">{task.title}</p>
              {combineTaskFeedback(taskFeedback[task.id], inlineCorrections[task.id]) && <div className="mt-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-300">INSTRUCTOR FEEDBACK &amp; CORRECTION</p>
                <TiptapEditor value={combineTaskFeedback(taskFeedback[task.id], inlineCorrections[task.id])} onChange={() => {}} ariaLabel={`${task.title} instructor feedback`} readOnly />
              </div>}
            </div>)}
            {stageVoiceFeedback[stage.id] && <div className="space-y-1"><p className="text-[10px] text-stone-500">Voice note</p><CustomAudioPlayer src={stageVoiceFeedback[stage.id]} label={`${stage.title} instructor voice note`} /></div>}
          </section>)}
          <section className="space-y-3 rounded-xl border border-border bg-surface/60 p-4">
            <h3 className="text-sm font-semibold text-stone-100">Final Student Feedback</h3>
            <textarea value={comments} onChange={(event) => updateEvaluation({ comments: event.target.value })} rows={4} placeholder="Personalized feedback and corrections..." className="w-full resize-y rounded-md border border-border bg-background p-3 text-sm text-stone-200 outline-none focus:border-amber-500/40" aria-label="Personalized feedback" />
            <div className="grid gap-3 sm:grid-cols-2">
              <textarea value={evaluation?.strengths || ""} onChange={(event) => updateEvaluation({ strengths: event.target.value })} rows={3} placeholder="Specific strengths..." className="w-full resize-y rounded-md border border-border bg-background p-3 text-xs text-stone-200 outline-none focus:border-amber-500/40" aria-label="Student strengths" />
              <textarea value={evaluation?.areasToImprove || ""} onChange={(event) => updateEvaluation({ areasToImprove: event.target.value })} rows={3} placeholder="Focused next steps..." className="w-full resize-y rounded-md border border-border bg-background p-3 text-xs text-stone-200 outline-none focus:border-amber-500/40" aria-label="Areas to improve" />
            </div>
            <textarea value={evaluation?.studyHubPrescription || ""} onChange={(event) => updateEvaluation({ studyHubPrescription: event.target.value })} rows={2} placeholder="Recommended study resource or topic..." className="w-full resize-y rounded-md border border-border bg-background p-3 text-xs text-stone-200 outline-none focus:border-amber-500/40" aria-label="Study Hub prescription" />
          </section>
        </div> : activeStage ?         <div className="min-w-0 space-y-5">
          <div className="min-w-0 space-y-5">
            {stageStepper}
            {stageHeading}
            {(activeStage.id === "reading" || activeStage.id === "listening") && (activeStage.referenceText || activeStage.referenceAudioUrl) && <details className="rounded-lg border border-border bg-surface p-3">
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
                  : "border-border bg-background";
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
              const modelBoxClass = "border-emerald-500/30 bg-emerald-500/5";
              const modelLabelClass = "text-emerald-300";
              const modelTextClass = "text-emerald-100";
              const taskReportCacheKey = submissionId
                ? JSON.stringify([submissionId, activeStage.id, task.id])
                : "";
              const taskReport = academisResultsByTask[taskReportCacheKey];
              return <article
                key={task.id}
                onClick={() => {
                  if (activeTask?.id !== task.id) {
                    setActiveTaskId(task.id);
                    setAcademisInsight(null);
                    setAcademisError(null);
                  }
                }}
                onFocusCapture={() => {
                  if (activeTask?.id !== task.id) {
                    setActiveTaskId(task.id);
                    setAcademisInsight(null);
                    setAcademisError(null);
                  }
                }}
                className={`space-y-3 rounded-xl border bg-surface p-4 ${activeTask?.id === task.id ? "border-amber-500/30" : "border-border"}`}
              >
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">Task Prompt {task.taskNumber ?? index + 1}</p>
                  <h3 className="mt-1 whitespace-pre-wrap break-words text-sm font-medium leading-relaxed text-stone-100">{stripMarkdown(task.prompt || task.title || "Task prompt not available.")}</h3>
                </div>
                <div className={`rounded-lg border p-4 ${responseBoxClass}`}>
                  <p className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${responseLabelClass}`}>Student response</p>
                  <p className={`mt-2 whitespace-pre-wrap break-words rounded-sm px-2 py-3 text-sm leading-relaxed ${isCorrect ? "bg-emerald-300/10" : isObjectiveAnswer ? "bg-rose-300/10" : "bg-surface"} ${responseTextClass}`}>{stripMarkdown(task.studentAnswer) || <span className="italic text-stone-500">No response submitted.</span>}</p>
                  {task.audioUrls?.map((url, audioIndex) => <div key={`${url}-${audioIndex}`} className="mt-2"><CustomAudioPlayer src={url} label={`${task.prompt || task.title || "Task"} student recording`} /></div>)}
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
                        ariaLabel={`${task.prompt || task.title || "Task"} instructor feedback and correction`}
                        compact
                        wrapToolbar
                      />
                    </div>
                  </div>
                </div>
                {taskReport && <details className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3">
                  <summary className="cursor-pointer text-[10px] font-semibold text-amber-200">Academis diagnostic · {taskReport.context.taskTitle}</summary>
                  <div className="mt-3 space-y-3 border-t border-amber-500/10 pt-3">
                    <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-stone-300">{taskReport.result.instructor_diagnostic.teaching_notes}</p>
                    {taskReport.result.instructor_diagnostic.key_error_patterns.length > 0 && <div>
                      <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-stone-500">Error patterns</p>
                      <ul className="space-y-2">
                        {taskReport.result.instructor_diagnostic.key_error_patterns.map((pattern, patternIndex) => <li key={`${pattern.pattern}-${patternIndex}`} className="rounded-md border border-border bg-background/70 p-2 text-[10px]">
                          <p className="font-medium text-stone-200">{pattern.pattern}</p>
                          <p className="mt-0.5 text-stone-500">{pattern.example}</p>
                          <p className="mt-1 text-amber-300/80">Lesson adjustment: {pattern.lesson_adjustment}</p>
                        </li>)}
                      </ul>
                    </div>}
                    {taskReport.result.instructor_diagnostic.targeted_resources.length > 0 && <div>
                      <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-stone-500">Resource recommendations</p>
                      <ul className="space-y-1.5">
                        {taskReport.result.instructor_diagnostic.targeted_resources.map((resource, resourceIndex) => <li key={`${resource.topic}-${resourceIndex}`} className="text-[10px]">
                          <span className="font-medium text-stone-200">{resource.title}</span>
                          <span className="text-stone-500"> · {resource.topic} — {resource.reason}</span>
                        </li>)}
                      </ul>
                    </div>}
                    <p className={`text-[10px] ${taskReport.stored ? "text-emerald-400/80" : "text-amber-300/80"}`}>
                      {taskReport.stored ? "Report saved for this submission." : "Report is available for this session; database storage was unavailable."}
                    </p>
                  </div>
                </details>}
              </article>;
            }) : <div className="rounded-lg border border-dashed border-border bg-surface p-5 text-center">
              <p className="text-sm font-medium text-stone-300">No interactive response in this stage</p>
              <p className="mt-1 text-xs text-stone-500">You can still add a stage score and instructor feedback.</p>
            </div>}
          </div>

          <section className="space-y-4 rounded-xl border border-border bg-surface/60 p-4" aria-label={`${activeStage.title} stage rubric`}>
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-3">
              <div>
                <h3 className="text-sm font-semibold text-stone-100">Stage Rubric</h3>
                <p className="mt-1 text-[10px] text-stone-500">Choose a scoring scale for {activeStage.title}, then rate each criterion.</p>
              </div>
              <label className="flex items-center gap-2 text-xs text-stone-400">
                Scoring scale
                <select
                  value={stageRubricScales[activeStage.id] || globalRubricScale}
                  onChange={(event) => {
                    const nextScale = event.target.value as RubricScale;
                    const currentScale = stageRubricScales[activeStage.id] || globalRubricScale;
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
                  className="rounded-md border border-border bg-background px-2.5 py-2 text-xs text-stone-200 outline-none focus:border-amber-500/40"
                  aria-label={`${activeStage.title} rubric scoring scale`}
                >
                  {RUBRIC_SCALE_OPTIONS.map((scale) => <option key={scale.id} value={scale.id}>{scale.label}</option>)}
                </select>
              </label>
            </div>
            <div className="divide-y divide-border">
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
                      className="rubric-score-input w-full rounded-md border border-border bg-background px-3 py-2 text-center text-xs text-amber-300 outline-none transition-colors hover:border-amber-500/30 focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20"
                      aria-label={`${activeStage.title} ${criterion.label} score value`}
                    />
                    <span className="text-[10px] text-stone-500">{score === undefined ? "—" : `/${scale.max}`}</span>
                  </div>
                </div>;
              })}
            </div>
            <label className="block border-t border-border pt-3 text-xs font-medium text-stone-300">Stage feedback
              <textarea value={stageFeedback[activeStage.id] || ""} onChange={(event) => updateEvaluation({ stageFeedback: { ...stageFeedback, [activeStage.id]: event.target.value } })} rows={3} placeholder={`Comments on ${activeStage.title.toLowerCase()}...`} className="mt-1 w-full resize-y rounded-md border border-border bg-background p-3 text-xs font-normal leading-relaxed text-stone-200 outline-none focus:border-amber-500/40" />
            </label>
            {(activeStage.id === "listening" || activeStage.id === "speaking") && <div className="space-y-2 border-t border-border pt-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-stone-200"><Mic className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />Audio feedback note</div>
              <AudioRecorder onBlob={(blob) => { void uploadStageVoiceNote(activeStage.id, blob); }} onError={setVoiceUploadError} disabled={voiceUploadStage === activeStage.id || isSubmitting} label={`Record ${activeStage.title.toLowerCase()} feedback`} />
              <label className="block text-[10px] text-stone-400">Or attach an audio file
                <input type="file" accept="audio/*" disabled={voiceUploadStage === activeStage.id || isSubmitting} onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file && !file.type.startsWith("audio/")) { setVoiceUploadError("Choose a valid audio file."); } else if (file) { void uploadStageVoiceNote(activeStage.id, file); } event.currentTarget.value = ""; }} className="mt-1 block w-full text-[10px] text-stone-400 file:mr-2 file:rounded file:border-0 file:bg-border file:px-2 file:py-1.5 file:text-[10px] file:text-stone-200" />
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

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <button type="button" onClick={() => changeActiveStage(activeStageIndex <= 0 ? reportStageId : activeStageIndex === reportStageIndex ? stages[stages.length - 1]?.id || reportStageId : stages[activeStageIndex - 1]?.id || reportStageId)} disabled={activeStageIndex <= 0} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs text-stone-300 transition hover:border-amber-500/40 disabled:cursor-not-allowed disabled:opacity-40">
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />Previous Stage
          </button>
          <button type="button" onClick={() => changeActiveStage(activeStageIndex >= reportStageIndex ? reportStageId : activeStageIndex === reportStageIndex - 1 ? reportStageId : stages[activeStageIndex + 1]?.id || reportStageId)} disabled={activeStageIndex >= reportStageIndex} className="inline-flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-40">
            Next Stage<ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
        {activeStageId === reportStageId && <button type="button" onClick={() => void handleSubmit()} disabled={isSubmitting || isSubmitted || voiceUploadStage !== null || (usePostgres && submissionLoadState !== "loaded")} className="w-full rounded-lg bg-amber-500/20 px-6 py-3 text-sm font-semibold text-amber-300 transition hover:bg-amber-500/30 disabled:cursor-wait disabled:opacity-50">
          {isSubmitting ? "Publishing..." : isSubmitted ? "Evaluation Published" : "Publish Evaluation & Send to Student"}
        </button>}
      </section>

      <aside className={`flex min-w-0 flex-col rounded-xl border border-amber-500/20 bg-surface transition-[padding] duration-300 xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] ${isAcademisSidebarCollapsed ? "p-2" : "p-4"}`} aria-label="Academis AI grading assistant">
        <div className={`flex shrink-0 items-center ${isAcademisSidebarCollapsed ? "justify-center" : "justify-between gap-2"}`}>
          {!isAcademisSidebarCollapsed && <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-300"><Sparkles className="h-4 w-4" aria-hidden="true" /></span>
            <div className="min-w-0">
              <p className="truncate text-[10px] font-semibold uppercase tracking-[0.15em] text-amber-400">Academis</p>
              <h2 className="truncate text-sm font-semibold text-stone-100">AI Grading Assistant</h2>
            </div>
          </div>}
          <button
            type="button"
            onClick={() => setIsAcademisSidebarCollapsed((collapsed) => !collapsed)}
            aria-label={isAcademisSidebarCollapsed ? "Expand Academis assistant" : "Collapse Academis assistant"}
            aria-expanded={!isAcademisSidebarCollapsed}
            aria-controls="academis-sidebar-content"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-border text-stone-300 transition hover:border-amber-500/40 hover:text-amber-400"
          >
            {isAcademisSidebarCollapsed ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </div>
        <div id="academis-sidebar-content" hidden={isAcademisSidebarCollapsed} className={`mt-4 min-h-0 flex-1 flex-col gap-3 overflow-y-auto ${isAcademisSidebarCollapsed ? "hidden" : "flex"}`}>
          <label className="block rounded-md border border-border bg-background/60 p-2.5 text-[10px] text-stone-400">
            Task to evaluate · {activeStage?.title || "Choose a stage"}
            <select
              value={activeTask?.id || ""}
              onChange={(event) => {
                setActiveTaskId(event.target.value);
                setAcademisInsight(null);
                setAcademisError(null);
              }}
              disabled={!activeStage?.tasks.length || isAcademisLoading}
              aria-label={`Task to evaluate in ${activeStage?.title || "current stage"}`}
              className="mt-1.5 w-full rounded-md border border-border bg-[#0b0e13] px-2.5 py-2 text-xs text-stone-200 outline-none transition focus:border-amber-500/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {!activeStage?.tasks.length && <option value="">No tasks in this stage</option>}
              {activeStage?.tasks.map((task, index) => {
                const title = stripMarkdown(task.title || task.prompt || `Task ${index + 1}`)
                  .replace(/\s+/g, " ")
                  .trim();
                const prompt = task.prompt?.trim()
                  ? stripMarkdown(task.prompt).replace(/\s+/g, " ").trim()
                  : "";
                const optionLabel = prompt && prompt !== title ? `${title} — ${prompt}` : title;
                return <option key={task.id} value={task.id}>
                  {`${String(index + 1).padStart(2, "0")} · ${optionLabel.slice(0, 140)}${optionLabel.length > 140 ? "…" : ""}`}
                </option>;
              })}
            </select>
          </label>
          {activeTask && <>
            <details className="group rounded-md border border-border bg-background/60">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500/60">
                Selected Task
                <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <p className="px-2.5 pb-2.5 break-words text-xs font-medium text-stone-200">{activeTask.title?.trim() || "Untitled task"}</p>
            </details>
            <details className="group rounded-md border border-border bg-background/60">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500/60">
                Task prompt
                <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <p className="max-h-20 overflow-y-auto whitespace-pre-wrap break-words px-2.5 pb-2.5 text-[10px] leading-relaxed text-stone-300">
                {stripMarkdown(activeTaskPrompt || "No task prompt is available.")}
              </p>
            </details>
            <details className="group rounded-md border border-border bg-background/60">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500/60">
                Student Response
                <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <p className="max-h-20 overflow-y-auto whitespace-pre-wrap break-words px-2.5 pb-2.5 text-[10px] leading-relaxed text-stone-300">
                {activeTask.studentAnswer?.trim()
                  ? stripMarkdown(activeTask.studentAnswer)
                  : activeTask.audioUrls?.length ? "Audio response submitted; transcript unavailable."
                    : "No written response submitted."}
              </p>
            </details>
          </>}

          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-400">Pinned Prompt</p>
            <button
              type="button"
              onClick={openAcademisLibrary}
              aria-label="Open Academis prompt library"
              title="Prompt Library"
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] text-stone-400 transition hover:border-amber-500/40 hover:text-amber-300"
            >
              <Settings2 className="h-3 w-3" aria-hidden="true" />
              Prompt Library
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5" aria-label="Pinned evaluation prompt presets">
            {pinnedAcademisPresets.map((preset) => <button
              key={preset.id}
              type="button"
              aria-pressed={activeAcademisPresetId === preset.id}
              onClick={() => {
                setActiveAcademisPresetId(preset.id);
                setAcademisPrompt(preset.prompt);
              }}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] transition ${activeAcademisPresetId === preset.id ? "border-amber-500/40 bg-amber-500/10 text-amber-200" : "border-border text-stone-400 hover:border-amber-500/30 hover:text-stone-200"}`}
            >
              <Star className="h-2.5 w-2.5 fill-current text-amber-400" aria-hidden="true" />
              {preset.label}
            </button>)}
            {!pinnedAcademisPresets.length && <p className="text-[10px] text-stone-500">Pin prompts in Prompt Library to add quick picks.</p>}
          </div>
          <section className="rounded-md border border-amber-500/25 bg-amber-500/5 p-2.5" aria-label="Active Academis prompt">
            <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-amber-400">Active evaluation prompt</p>
            <p className="mt-1 text-[10px] font-medium text-stone-200">
              {activeAcademisPreset?.label || "Custom prompt"}
              {activeAcademisPresetId && !activeAcademisPreset ? " · custom" : ""}
            </p>
            <p className="mt-1 max-h-20 overflow-y-auto whitespace-pre-wrap break-words text-[10px] leading-relaxed text-stone-400">
              {academisPrompt.trim() || "No evaluation prompt selected."}
            </p>
          </section>

          <button
            type="button"
            onClick={() => void generateAcademisInsight()}
            disabled={isAcademisLoading || !submissionId || !activeTask}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-amber-500/20 px-3 py-2 text-xs font-semibold text-amber-200 transition hover:bg-amber-500/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            {isAcademisLoading
              ? "Evaluating…"
              : !submissionId
                ? submissionLoadState === "loading" ? "Loading submission…" : "Submission unavailable"
                : !activeTask
                  ? "Select a task to evaluate"
                  : hasCachedAcademisResult ? "View Last Evaluation Report"
                    : academisInsight ? "Run again with Academis" : "Evaluate with Academis"}
          </button>
        </div>
      </aside>
    </div>
    {isAcademisLibraryOpen && <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setIsAcademisLibraryOpen(false);
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="academis-library-title"
        className="flex max-h-[min(90vh,860px)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-amber-500/30 bg-[#11151b] text-stone-200 shadow-2xl shadow-black/50"
      >
        <header className="flex items-center justify-between gap-4 border-b border-border px-5 py-4 sm:px-7">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-400">Academis</p>
            <h2 id="academis-library-title" className="mt-1 text-lg font-semibold text-stone-100">Prompt Library</h2>
            <p className="mt-1 text-xs text-stone-500">Shape the grading guidance used for each evaluation.</p>
          </div>
          <button
            type="button"
            onClick={() => setIsAcademisLibraryOpen(false)}
            aria-label="Close prompt library"
            className="rounded-md border border-border p-2 text-stone-400 transition hover:border-amber-500/40 hover:text-amber-300"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5 sm:p-7">
          <div className="flex items-center gap-2 overflow-x-auto border-b border-border" role="tablist" aria-label="Prompt categories">
            {academisCategoryDrafts.map((category) => <div key={category.id} role="presentation" className="flex shrink-0 items-center">
              <button
                type="button"
                role="tab"
                aria-selected={activeAcademisCategoryId === category.id}
                aria-controls={`academis-category-panel-${category.id}`}
                onClick={() => {
                  setActiveAcademisCategoryId(category.id);
                  setAcademisLibraryError(null);
                }}
                className={`shrink-0 border-b-2 px-3 py-2.5 text-xs transition ${activeAcademisCategoryId === category.id ? "border-amber-400 text-amber-200" : "border-transparent text-stone-500 hover:text-stone-200"}`}
              >
                {category.label}
              </button>
              {!DEFAULT_ACADEMIS_CATEGORIES.some((defaultCategory) => defaultCategory.id === category.id) && <button
                type="button"
                onClick={() => deleteAcademisCategory(category.id)}
                aria-label={`Delete ${category.label} category`}
                title={`Delete ${category.label}`}
                className="rounded p-1 text-stone-600 transition hover:bg-amber-500/10 hover:text-amber-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500/60"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>}
            </div>)}
            <button
              type="button"
              onClick={() => {
                const category = { id: `type-${crypto.randomUUID()}`, label: `New Type ${academisCategoryDrafts.length + 1}` };
                setAcademisCategoryDrafts((categories) => [...categories, category]);
                setActiveAcademisCategoryId(category.id);
                setAcademisLibraryError(null);
              }}
              className="shrink-0 px-3 py-2.5 text-xs text-amber-300 transition hover:text-amber-200"
            >
              + Type
            </button>
          </div>

          {academisCategoryDrafts.filter((category) => category.id === activeAcademisCategoryId).map((category) => <div
            key={category.id}
            id={`academis-category-panel-${category.id}`}
            role="tabpanel"
            className="space-y-4"
          >
            <label className="block max-w-sm text-xs text-stone-500">
              Category name
              <input
                value={category.label}
                maxLength={40}
                onChange={(event) => setAcademisCategoryDrafts((categories) => categories.map((item) => item.id === category.id ? { ...item, label: event.target.value } : item))}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-stone-200 outline-none focus:border-amber-500/40"
              />
            </label>

            {academisPresetDrafts.filter((preset) => preset.categoryId === category.id).map((preset) => <article
              key={preset.id}
              className="rounded-lg border border-border bg-background/70 p-4 sm:p-5"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">Evaluation prompt</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-pressed={preset.isFavorite}
                    aria-label={preset.isFavorite ? `Unpin ${preset.label}` : `Pin ${preset.label}`}
                    title={preset.isFavorite ? "Unpin preset" : "Pin to sidebar"}
                    onClick={() => {
                      if (!preset.isFavorite && academisPresetDrafts.filter((item) => item.isFavorite).length >= 3) {
                        setAcademisLibraryError("Pin up to 3 presets for quick access in the sidebar.");
                        return;
                      }
                      setAcademisPresetDrafts((drafts) => drafts.map((item) => item.id === preset.id ? { ...item, isFavorite: !item.isFavorite } : item));
                      setAcademisLibraryError(null);
                    }}
                    className={`rounded-md border p-2 transition ${preset.isFavorite ? "border-amber-500/40 bg-amber-500/10 text-amber-300" : "border-border text-stone-500 hover:border-amber-500/30 hover:text-amber-200"}`}
                  >
                    {preset.isFavorite ? <Star className="h-4 w-4 fill-current" aria-hidden="true" /> : <Pin className="h-4 w-4" aria-hidden="true" />}
                  </button>
                  {!ACADEMIS_PROMPTS.some((defaultPreset) => defaultPreset.id === preset.id) && <button
                    type="button"
                    onClick={() => setAcademisPresetDrafts((drafts) => drafts.filter((item) => item.id !== preset.id))}
                    aria-label={`Delete ${preset.label || "custom"} preset`}
                    className="rounded-md px-2 py-1 text-[10px] text-stone-500 transition hover:text-red-300"
                  >
                    Delete
                  </button>}
                </div>
              </div>
              <label className="block text-xs text-stone-400">
                Title
                <input
                  value={preset.label}
                  maxLength={40}
                  onChange={(event) => setAcademisPresetDrafts((drafts) => drafts.map((item) => item.id === preset.id ? { ...item, label: event.target.value } : item))}
                  placeholder="Preset title"
                  className="mt-1.5 w-full rounded-md border border-border bg-[#0b0e13] px-3 py-2.5 text-sm text-stone-100 outline-none transition focus:border-amber-500/50"
                />
              </label>
              <label className="mt-3 block text-xs text-stone-400">
                Prompt
                <textarea
                  value={preset.prompt}
                  maxLength={MAX_INSTRUCTOR_PROMPT_LENGTH}
                  rows={4}
                  onChange={(event) => setAcademisPresetDrafts((drafts) => drafts.map((item) => item.id === preset.id ? { ...item, prompt: event.target.value } : item))}
                  placeholder="Describe the focus and style for this grading run..."
                  className="mt-1.5 w-full resize-y rounded-md border border-border bg-[#0b0e13] px-3 py-2.5 text-sm leading-relaxed text-stone-200 outline-none transition focus:border-amber-500/50"
                />
              </label>
            </article>)}

            <button
              type="button"
              onClick={() => setAcademisPresetDrafts((drafts) => [...drafts, {
                id: `custom-${crypto.randomUUID()}`,
                label: "",
                prompt: "",
                categoryId: category.id,
                isFavorite: false,
              }])}
              className="rounded-md border border-dashed border-amber-500/30 px-3 py-2 text-xs text-amber-300 transition hover:border-amber-500/60 hover:bg-amber-500/5"
            >
              + Preset
            </button>
          </div>)}
          {academisLibraryError && <p role="alert" className="text-xs text-red-300">{academisLibraryError}</p>}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-border px-5 py-4 sm:px-7">
          <button
            type="button"
            onClick={() => setIsAcademisLibraryOpen(false)}
            className="rounded-md px-3 py-2 text-xs text-stone-400 transition hover:text-stone-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={saveAcademisLibrary}
            className="rounded-md bg-amber-500/20 px-4 py-2 text-xs font-semibold text-amber-200 transition hover:bg-amber-500/30"
          >
            Save changes
          </button>
        </footer>
      </section>
    </div>}
    {isAcademisResultOpen && <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-black/80 p-3 backdrop-blur-md sm:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isAcademisLoading) setIsAcademisResultOpen(false);
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="academis-result-title"
        className="flex max-h-[96vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-amber-500/30 bg-[#10141b] text-stone-200 shadow-2xl shadow-black/60"
      >
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-5 py-4 sm:px-8 sm:py-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-300">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-400">Academis Evaluation</p>
              <h2 id="academis-result-title" className="mt-1 truncate text-lg font-semibold text-stone-100">
                {academisRequestContext?.taskTitle || "Preparing evaluation"}
              </h2>
              <p className="mt-0.5 truncate text-xs text-stone-500">
                {academisRequestContext?.stageTitle || activeStageTitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsAcademisResultOpen(false)}
            disabled={isAcademisLoading}
            aria-label="Close Academis evaluation"
            className="rounded-md border border-border p-2 text-stone-400 transition hover:border-amber-500/40 hover:text-amber-300 disabled:cursor-wait disabled:opacity-50"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
          {!isAcademisLoading && academisInsight && <button
            type="button"
            onClick={() => void generateAcademisInsight(true)}
            className="rounded-md border border-amber-500/30 px-3 py-2 text-xs font-medium text-amber-200 transition hover:bg-amber-500/10"
          >
            Run again
          </button>}
        </header>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5 sm:p-8">
          {academisRequestContext && <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-border bg-[#0b0e13] p-4 sm:p-5" aria-label="Task prompt being evaluated">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Task prompt</p>
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-stone-200">{stripMarkdown(academisRequestContext.taskPrompt)}</p>
            </section>
            <section className="rounded-xl border border-border bg-[#0b0e13] p-4 sm:p-5" aria-label="Student response being evaluated">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">Student response</p>
              <p className="max-h-52 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-relaxed text-stone-300">{stripMarkdown(academisRequestContext.studentResponse)}</p>
            </section>
          </div>}

          {academisRequestContext && <section className="rounded-lg border border-border bg-background/50 px-4 py-3">
            <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-stone-500">Evaluation instruction used</p>
            <p className="mt-1 text-[11px] font-medium text-stone-300">
              {academisPresets.find((preset) => preset.prompt === academisRequestContext.instructorPrompt)?.label || "Custom prompt"}
            </p>
            <p className="mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-stone-400">{academisRequestContext.instructorPrompt || "Use concise, evidence-based language-learning feedback."}</p>
          </section>}

          {isAcademisLoading && <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-center" role="status" aria-live="polite">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500/20 border-t-amber-400" aria-hidden="true" />
            <p className="text-sm font-medium text-stone-200">Academis is evaluating this response</p>
            <p className="text-xs text-stone-500">Scoring each rubric criterion and preparing instructor diagnostics…</p>
          </div>}

          {!isAcademisLoading && academisError && <div role="alert" className="rounded-lg border border-red-500/30 bg-red-950/30 p-4 text-sm text-red-200">
            {academisError}
          </div>}

          {!isAcademisLoading && academisInsight && <>
            <section aria-label="Granular rubric scores">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">Granular rubric breakdown</p>
                  <h3 className="mt-1 text-sm font-semibold text-stone-100">Criterion scores</h3>
                </div>
                <p className="text-xs text-stone-500">Four criterion scores averaged</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {RUBRIC_CRITERIA.map((criterion) => {
                  const score = academisInsight.result.criteria_scores[criterion.id as keyof AcademisInsight["criteria_scores"]];
                  return <article key={criterion.id} className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs leading-relaxed text-stone-300">{criterion.label}</p>
                      <p className="shrink-0 text-xl font-semibold text-amber-300">{score}<span className="text-[10px] text-stone-500"> / 9</span></p>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-stone-800">
                      <div className="h-full rounded-full bg-amber-500" style={{ width: `${(score / 9) * 100}%` }} />
                    </div>
                  </article>;
                })}
              </div>
              <div className="mt-3 flex items-center justify-between rounded-lg border border-amber-500/35 bg-amber-500/10 px-4 py-3">
                <span className="text-xs font-medium text-amber-100">Overall Band Score · arithmetic mean</span>
                <span className="text-xl font-semibold text-amber-300">{academisInsight.result.overall_band_score.toFixed(2)}<span className="text-xs text-amber-200/60"> / 9</span></span>
              </div>
            </section>

            <section>
              <div className="flex items-center gap-1 border-b border-border" role="tablist" aria-label="Academis evaluation results">
                <button
                  type="button"
                  role="tab"
                  id="academis-student-summary-tab"
                  aria-selected={academisResultTab === "student-summary"}
                  aria-controls="academis-student-summary-panel"
                  onClick={() => setAcademisResultTab("student-summary")}
                  className={`border-b-2 px-4 py-3 text-xs font-medium transition ${academisResultTab === "student-summary" ? "border-amber-400 text-amber-200" : "border-transparent text-stone-500 hover:text-stone-200"}`}
                >
                  Student Summary
                </button>
                <button
                  type="button"
                  role="tab"
                  id="academis-instructor-diagnostic-tab"
                  aria-selected={academisResultTab === "instructor-diagnostic"}
                  aria-controls="academis-instructor-diagnostic-panel"
                  onClick={() => setAcademisResultTab("instructor-diagnostic")}
                  className={`border-b-2 px-4 py-3 text-xs font-medium transition ${academisResultTab === "instructor-diagnostic" ? "border-amber-400 text-amber-200" : "border-transparent text-stone-500 hover:text-stone-200"}`}
                >
                  Instructor Diagnostic
                </button>
              </div>

              {academisResultTab === "student-summary" && <div id="academis-student-summary-panel" role="tabpanel" aria-labelledby="academis-student-summary-tab" className="space-y-4 pt-5">
                <label className="block text-xs font-medium text-stone-300">
                  Student-facing feedback
                  <textarea
                    value={academisStudentSummary}
                    onChange={(event) => setAcademisStudentSummary(event.target.value)}
                    rows={5}
                    className="mt-2 w-full resize-y rounded-xl border border-border bg-[#0b0e13] p-4 text-sm leading-relaxed text-stone-100 outline-none transition focus:border-amber-500/40"
                    aria-label="Edit Academis student summary"
                  />
                </label>
                <p className="text-[11px] leading-relaxed text-stone-500">This is kept separate from instructor-only diagnostics. Edit it here before applying it to the student feedback field.</p>
                <button
                  type="button"
                  onClick={() => {
                    const { stageId, taskId } = academisInsight.context;
                    const stageScale = stageRubricScales[stageId] || globalRubricScale;
                    const stageTaskIds = new Set(activeStage?.id === stageId
                      ? activeStage.tasks.map((task) => task.id)
                      : [taskId]);
                    const reportsByTask = new Map(Object.values(academisResultsByTask)
                      .filter((report) => report.context.stageId === stageId && stageTaskIds.has(report.context.taskId))
                      .map((report) => [report.context.taskId, report]));
                    reportsByTask.set(taskId, academisInsight);
                    const stageReports = [...reportsByTask.values()];
                    const averagedScores = Object.fromEntries(RUBRIC_CRITERIA.map(({ id }) => {
                      const average = stageReports.reduce((sum, report) => (
                        sum + report.result.criteria_scores[id as keyof AcademisInsight["criteria_scores"]]
                      ), 0) / stageReports.length;
                      return [id, convertRubricScore(average, "ielts", stageScale)];
                    }));
                    const averagedOverallBand = stageReports.reduce((sum, report) => (
                      sum + report.result.overall_band_score
                    ), 0) / stageReports.length;
                    updateEvaluation({
                      taskFeedback: { ...taskFeedback, [taskId]: academisStudentSummary },
                      stageScores: { ...stageScores, [stageId]: { ...stageScores[stageId], ...averagedScores } },
                    });
                    setAcademisApplyNotice(`Summary applied to ${academisInsight.context.taskTitle}; stage rubric averages ${averagedOverallBand.toFixed(2)} across ${stageReports.length} evaluated task${stageReports.length === 1 ? "" : "s"}.`);
                  }}
                  className="rounded-md bg-amber-500/20 px-4 py-2.5 text-xs font-semibold text-amber-200 transition hover:bg-amber-500/30"
                >
                  Apply to Student Feedback &amp; Rubric
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const stageId = academisInsight.context.stageId;
                    updateEvaluation({ stageFeedback: { ...stageFeedback, [stageId]: academisStudentSummary } });
                    setAcademisApplyNotice(`Student summary applied to ${academisInsight.context.stageTitle} Stage Feedback.`);
                  }}
                  className="ml-2 rounded-md border border-amber-500/30 px-4 py-2.5 text-xs font-medium text-amber-200 transition hover:bg-amber-500/10"
                >
                  Apply to Stage Feedback
                </button>
              </div>}

              {academisResultTab === "instructor-diagnostic" && <div id="academis-instructor-diagnostic-panel" role="tabpanel" aria-labelledby="academis-instructor-diagnostic-tab" className="space-y-5 pt-5">
                <section className="rounded-xl border border-border bg-[#0b0e13] p-4 sm:p-5">
                  <h3 className="text-sm font-semibold text-stone-100">Teaching notes</h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-stone-300">{academisInsight.result.instructor_diagnostic.teaching_notes || "No additional teaching notes."}</p>
                </section>
                <section>
                  <h3 className="mb-3 text-sm font-semibold text-stone-100">Observed error patterns</h3>
                  {academisInsight.result.instructor_diagnostic.key_error_patterns.length
                    ? <div className="grid gap-3 md:grid-cols-2">
                      {academisInsight.result.instructor_diagnostic.key_error_patterns.map((pattern, index) => <article key={`${pattern.pattern}-${index}`} className="rounded-xl border border-border bg-[#0b0e13] p-4">
                        <p className="text-sm font-medium text-stone-200">{pattern.pattern}</p>
                        <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-stone-400">{pattern.example}</p>
                        <p className="mt-3 border-t border-border pt-2 text-xs leading-relaxed text-amber-200/80">Lesson adjustment: {pattern.lesson_adjustment}</p>
                      </article>)}
                    </div>
                    : <p className="rounded-lg border border-border bg-[#0b0e13] p-4 text-xs text-stone-500">No recurring error patterns were identified for this response.</p>}
                </section>
                <section>
                  <h3 className="mb-3 text-sm font-semibold text-stone-100">Targeted resource recommendations</h3>
                  {academisInsight.result.instructor_diagnostic.targeted_resources.length
                    ? <div className="grid gap-3 md:grid-cols-2">
                      {academisInsight.result.instructor_diagnostic.targeted_resources.map((resource, index) => <article key={`${resource.topic}-${index}`} className="rounded-xl border border-amber-500/15 bg-amber-500/[0.03] p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-400">{resource.topic}</p>
                        <p className="mt-1 text-sm font-medium text-stone-100">{resource.title}</p>
                        <p className="mt-2 text-xs leading-relaxed text-stone-400">{resource.reason}</p>
                      </article>)}
                    </div>
                    : <p className="rounded-lg border border-border bg-[#0b0e13] p-4 text-xs text-stone-500">No additional resources were recommended.</p>}
                </section>
                <p className="text-[10px] text-stone-500">
                  Instructor diagnostic and resource recommendations are {academisInsight.stored ? "saved to this submission" : "available for this session"} and shown in the selected task&apos;s stage notes.
                </p>
              </div>}
            </section>
          </>}
        </div>
      </section>
    </div>}
    {academisApplyNotice && <div
      role="status"
      aria-live="polite"
      className="fixed bottom-5 right-5 z-[150] max-w-sm rounded-md border border-amber-500/30 bg-[#11151b] px-4 py-3 text-xs text-amber-100 shadow-xl shadow-black/40"
    >
      {academisApplyNotice}
    </div>}
  </div>;
}

export default SubmissionEvaluator;
