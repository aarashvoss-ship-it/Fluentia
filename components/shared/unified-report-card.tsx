"use client";

import { CustomAudioPlayer } from "@/components/study-room/custom-audio-player";
import { TiptapEditor } from "@/components/shared/tiptap-editor";
import { combineTaskFeedback } from "@/lib/evaluation-feedback";
import {
  aggregateOverallRubric,
  calculateStageOverallScore,
  formatOverallRubricTotal,
  formatRubricScore,
  getRubricScale,
  normalizeRubricScore,
  roundRubricScoreForScale,
} from "@/lib/rubric-scoring";

export interface UnifiedReportTask {
  id: string;
  title: string;
  studentAnswer: string;
  taskNumber?: number;
  modelAnswer?: string;
  isCorrect?: boolean;
  autoCheck?: boolean;
  audioUrls?: string[];
  explanation?: string;
}

export interface UnifiedReportStage {
  id: string;
  title: string;
  prompt?: string;
  referenceText?: string;
  referenceAudioUrl?: string;
  tasks: UnifiedReportTask[];
}

interface UnifiedReportCardProps {
  stages: UnifiedReportStage[];
  isInstructorView: boolean;
  isEvaluationView?: boolean;
  isEvaluated: boolean;
  scores: Record<string, number>;
  criterionFeedback: Record<string, string>;
  stageFeedback: Record<string, string>;
  stageScores?: Record<string, Record<string, number>>;
  stageRubricScales?: Record<string, string>;
  reportCardScoreOverrides?: Record<string, number>;
  taskFeedback?: Record<string, string>;
  inlineCorrections?: Record<string, string>;
  stageVoiceFeedback?: Record<string, string>;
  comments: string;
  strengths?: string;
  areasToImprove?: string;
  studyHubPrescription?: string;
  onScoreChange?: (criterion: string, score: number) => void;
  onCriterionFeedbackChange?: (criterion: string, value: string) => void;
  onStageFeedbackChange?: (stageId: string, value: string) => void;
  onGeneralFeedbackChange?: (field: "comments" | "strengths" | "areasToImprove" | "studyHubPrescription", value: string) => void;
  onPublish?: () => void;
  isSubmitting?: boolean;
  isSubmitted?: boolean;
  submitError?: string | null;
}

const RUBRIC_CRITERIA = [
  { id: "task", label: "Task Achievement & Depth" },
  { id: "coherence", label: "Coherence & Flow" },
  { id: "lexical", label: "Lexical Precision & Range" },
  { id: "grammar", label: "Grammatical Accuracy" },
];

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

function FeedbackValue({ value, isEvaluated }: { value?: string; isEvaluated: boolean }) {
  return <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-stone-300">{value?.trim() || <span className="italic text-stone-500">{isEvaluated ? "No comment provided." : "Pending Review"}</span>}</p>;
}

export function UnifiedReportCard({
  stages,
  isInstructorView,
  isEvaluationView = false,
  isEvaluated,
  scores,
  criterionFeedback,
  stageFeedback,
  stageScores = {},
  stageRubricScales = {},
  reportCardScoreOverrides = {},
  taskFeedback = {},
  inlineCorrections = {},
  stageVoiceFeedback = {},
  comments,
  strengths,
  areasToImprove,
  studyHubPrescription,
  onScoreChange,
  onCriterionFeedbackChange,
  onStageFeedbackChange,
  onGeneralFeedbackChange,
  onPublish,
  isSubmitting = false,
  isSubmitted = false,
  submitError,
}: UnifiedReportCardProps) {
  const overallAggregation = aggregateOverallRubric({
    criterionIds: RUBRIC_CRITERIA.map(({ id }) => id),
    stageScores,
    stageRubricScales,
    reportCardScoreOverrides,
    fallbackScores: scores,
  });
  const overallScaleId = overallAggregation.scaleId;
  const overallScale = getRubricScale(overallScaleId);
  const displayScores = overallAggregation.displayCriterionScores;
  const totalScore = overallAggregation.totalScore;

  const renderGeneralField = (
    field: "comments" | "strengths" | "areasToImprove" | "studyHubPrescription",
    label: string,
    value?: string,
    placeholder = "",
  ) => <div key={field} className="rounded-lg border border-blue-500/20 bg-blue-950/30 p-4">
    <p className="text-xs font-semibold text-stone-300">{label}</p>
    {isInstructorView ? <textarea
      value={value || ""}
      onChange={(event) => onGeneralFeedbackChange?.(field, event.target.value)}
      placeholder={placeholder}
      rows={4}
      className="mt-2 w-full resize-y rounded-md border border-border bg-surface p-3 text-sm leading-relaxed text-stone-200 outline-none focus:border-amber-500/40"
    /> : <FeedbackValue value={value} isEvaluated={isEvaluated} />}
  </div>;

  return <div className="w-full space-y-8 text-left">
    <section aria-label="Report card tasks" className="space-y-4">
      <div className="flex items-end justify-between gap-4 border-b border-border pb-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">{isInstructorView ? "Submission Report Card" : "Results & Review"}</p>
          <h2 className="mt-1 text-xl font-semibold text-stone-100">Lesson Tasks</h2>
        </div>
      </div>
      <div className="flex w-full min-w-0 flex-col gap-4">
        {stages.map((stage) => <section key={stage.id} className="w-full min-w-0 space-y-3 rounded-xl border border-border bg-surface/60 p-5">
          <div className="border-b border-border pb-3">
            <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-amber-400">{stage.title}</h3>
            {stage.prompt && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-stone-400">{stripMarkdown(stage.prompt)}</p>}
          </div>
          {isInstructorView && (stage.id === "reading" || stage.id === "listening") && <details className="mb-4 rounded-lg border border-slate-800 bg-slate-900/50 p-4">
            <summary className="cursor-pointer text-sm font-medium text-stone-200">Show Lesson Reference / Passage</summary>
            {stage.referenceText && <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-stone-300">{stripMarkdown(stage.referenceText)}</p>}
            {stage.referenceAudioUrl && <div className="mt-3"><CustomAudioPlayer src={stage.referenceAudioUrl} label={`${stage.title} lesson reference audio`} /></div>}
            {!stage.referenceText && !stage.referenceAudioUrl && <p className="mt-3 text-sm text-stone-400">No lesson reference is available.</p>}
          </details>}
          {stage.tasks.length > 0 ? <div className="space-y-3">
            {stage.tasks.map((task, index) => {
              const normalizedStudentAnswer = normalizeAnswer(task.studentAnswer);
              const matchesModelAnswer = task.modelAnswer?.split(/[\/|]/).some(
                (candidate) => normalizeAnswer(candidate) === normalizedStudentAnswer,
              ) ?? false;
              const hasObjectiveAnswer = task.isCorrect !== undefined || task.autoCheck === true;
              const isCorrect = task.isCorrect !== undefined
                ? task.isCorrect
                : task.autoCheck === true && matchesModelAnswer;
              const isIncorrect = hasObjectiveAnswer && !isCorrect;
              const responseCardClass = isEvaluationView && isCorrect
                ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-100"
                : isEvaluationView && isIncorrect
                  ? "border-rose-500/30 bg-rose-500/5 text-rose-100"
                  : "border-border bg-surface text-stone-200";
              const responseLabelClass = isEvaluationView && isCorrect
                ? "text-emerald-300"
                : isEvaluationView && isIncorrect
                  ? "text-rose-300"
                  : "text-stone-400";
              const responseTextClass = isEvaluationView && isCorrect
                ? "text-emerald-100"
                : isEvaluationView && isIncorrect
                  ? "text-rose-100"
                  : "text-stone-200";
              const modelCardClass = "border-indigo-500/30 bg-indigo-950/20 text-indigo-100";
              const modelLabelClass = "text-indigo-400";
              const modelTextClass = "text-indigo-100";
              return <article key={task.id} className="w-full min-w-0 rounded-lg border border-border bg-background p-4">
              <div className="rounded-md border border-zinc-800 bg-zinc-900/90 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">Task Prompt</p>
                <h4 className="mt-1 text-sm font-medium leading-relaxed text-stone-100">{index + 1}. {stripMarkdown(task.title)}</h4>
              </div>
              <div className={`mt-3 rounded-md border p-4 ${responseCardClass}`}>
                <p className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${responseLabelClass}`}>Your Response</p>
                <p className={`mt-2 whitespace-pre-wrap break-words rounded-sm px-2 py-3 text-sm leading-relaxed ${isEvaluationView && isCorrect ? "bg-emerald-300/10" : isEvaluationView && isIncorrect ? "bg-rose-300/10" : "bg-surface"} ${responseTextClass}`}>{stripMarkdown(task.studentAnswer) || <span className={`italic ${responseLabelClass}`}>No response submitted.</span>}</p>
                {task.audioUrls?.map((url, mediaIndex) => <div key={`${url}-${mediaIndex}`} className="mt-2 min-w-0 max-w-full overflow-hidden"><CustomAudioPlayer src={url} label={`${stripMarkdown(task.title)} recording`} /></div>)}
              </div>
              {task.modelAnswer && <div className={`mt-3 rounded-md border p-4 ${modelCardClass}`}>
                <p className={`text-[10px] font-semibold uppercase tracking-wider ${modelLabelClass}`}>Correct / Model Answer</p>
                <p className={`mt-2 whitespace-pre-wrap break-words py-2 text-sm leading-relaxed ${modelTextClass}`}>{stripMarkdown(task.modelAnswer)}</p>
              </div>}
              {task.explanation && <div className="mt-3 border-t border-border pt-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">Explanation</p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-stone-400">{stripMarkdown(task.explanation)}</p>
              </div>}
              {!isInstructorView && combineTaskFeedback(taskFeedback[task.id], inlineCorrections[task.id]) && <div className="mt-3 rounded-md border border-border bg-surface p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-300">INSTRUCTOR FEEDBACK &amp; CORRECTION</p>
                <TiptapEditor value={combineTaskFeedback(taskFeedback[task.id], inlineCorrections[task.id])} onChange={() => {}} ariaLabel={`${stripMarkdown(task.title)} instructor feedback`} readOnly />
              </div>}
            </article>;
            })}
          </div> : <div className="rounded-lg border border-dashed border-border bg-background/60 px-4 py-5 text-center">
            <p className="text-sm font-medium text-stone-300">{stage.id === "speaking" ? "No speaking recording submitted" : "Instructional Step Completed"}</p>
            {stage.id !== "speaking" && <p className="mt-1 text-xs leading-relaxed text-stone-500">This stage focused on learning content and required no interactive response.</p>}
          </div>}
          <div className={`rounded-lg border p-4 ${isInstructorView ? "border-border bg-background" : "border-border bg-surface"}`}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">Instructor Task Feedback</p>
            {isInstructorView ? <textarea
              value={stageFeedback[stage.id] || ""}
              onChange={(event) => onStageFeedbackChange?.(stage.id, event.target.value)}
              placeholder="Add feedback for this section (optional)..."
              rows={3}
              className="mt-2 w-full resize-y rounded-md border border-border bg-surface p-3 text-sm text-stone-200 outline-none focus:border-amber-500/40"
            /> : stageFeedback[stage.id]?.trim() ? <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-stone-300">{stageFeedback[stage.id]}</p> : <p className="mt-1 text-sm text-stone-500">{isEvaluated ? "No comment provided." : "Pending Instructor Review"}</p>}
          </div>
          {!isInstructorView && Object.keys(stageScores[stage.id] || {}).length > 0 && <div className="grid gap-2 sm:grid-cols-3">
            {Object.entries(stageScores[stage.id] || {}).map(([criterion, score]) => {
              const scaleId = stageRubricScales[stage.id];
              const scale = getRubricScale(scaleId);
              const criterionLabel = RUBRIC_CRITERIA.find(({ id }) => id === criterion)?.label || criterion;
              return <div key={criterion} className="rounded-md border border-border bg-background px-3 py-2 text-xs text-stone-400">
                <span>{criterionLabel}</span><span className="float-right text-amber-300">{formatRubricScore(roundRubricScoreForScale(score, scaleId))}/{scale.max}</span>
              </div>;
            })}
            {(() => {
              const scaleId = stageRubricScales[stage.id];
              const scale = getRubricScale(scaleId);
              const stageOverallScore = calculateStageOverallScore(
                stageScores[stage.id] || {},
                RUBRIC_CRITERIA.map(({ id }) => id),
                scaleId,
              );
              return stageOverallScore === undefined ? null : <div className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-400">
                <span>Stage Overall Score</span><span className="float-right">{formatRubricScore(stageOverallScore)}/{scale.max}</span>
              </div>;
            })()}
          </div>}
          {!isInstructorView && stageVoiceFeedback[stage.id] && <div className="rounded-lg border border-border bg-background p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">Instructor voice feedback</p>
            <CustomAudioPlayer src={stageVoiceFeedback[stage.id]} label={`${stage.title} instructor voice feedback`} />
          </div>}
        </section>)}
      </div>
    </section>

    <section aria-label="Overall Performance Breakdown" className="space-y-3 rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 sm:p-5">
      <div className="flex items-center justify-between border-b border-emerald-800/40 pb-3">
        <h3 className="text-lg font-semibold text-white">Overall Performance Breakdown</h3>
        <span className="inline-flex items-baseline gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 px-2.5 py-1 font-bold leading-tight text-amber-400">
          {overallScaleId === "ielts" ? <>
            <span className="text-xs">Overall Band Score:</span>
            <span className="text-sm">{totalScore.toFixed(1)} / {overallAggregation.totalDenominator}</span>
          </> : <span className="text-sm">{formatOverallRubricTotal(totalScore, overallScaleId, overallAggregation.totalDenominator)}</span>}
        </span>
      </div>
      <div className="flex flex-col gap-3">
        {RUBRIC_CRITERIA.map((criterion) => <div key={criterion.id} className="space-y-3 rounded-lg border border-emerald-500/20 bg-emerald-950/30 p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-stone-300">{criterion.label}</span>
            <span className="text-sm font-semibold text-amber-400">{displayScores[criterion.id] === undefined ? (!isInstructorView && !isEvaluated ? "Pending Review" : `—/${overallScale.max}`) : `${formatRubricScore(displayScores[criterion.id])}/${overallScale.max}`}</span>
          </div>
          {isInstructorView ? <>
            <div className="flex items-center gap-2">
              <input type="range" min={overallScale.min} max={overallScale.max} step={overallScale.step} value={displayScores[criterion.id] ?? overallScale.min} onChange={(event) => onScoreChange?.(criterion.id, normalizeRubricScore(Number(event.target.value), overallScaleId))} className="w-full accent-amber-500" aria-label={`${criterion.label} score`} />
              <input type="number" min={overallScale.min} max={overallScale.max} step={overallScale.step} value={displayScores[criterion.id] ?? overallScale.min} onChange={(event) => {
                const value = Number(event.target.value);
                if (event.target.value !== "" && Number.isFinite(value) && value >= overallScale.min && value <= overallScale.max) {
                  onScoreChange?.(criterion.id, normalizeRubricScore(value, overallScaleId));
                }
              }} className="rubric-score-input w-20 rounded-md border border-border bg-surface px-2 py-1.5 text-center text-xs text-amber-300 outline-none focus:border-amber-500/40" aria-label={`${criterion.label} score value`} />
            </div>
            <textarea value={criterionFeedback[criterion.id] || ""} onChange={(event) => onCriterionFeedbackChange?.(criterion.id, event.target.value)} placeholder={`Written feedback for ${criterion.label.toLowerCase()}...`} rows={2} className="w-full resize-y rounded-md border border-border bg-surface p-2.5 text-xs text-stone-200 outline-none focus:border-amber-500/40" aria-label={`${criterion.label} feedback`} />
          </> : <FeedbackValue value={criterionFeedback[criterion.id]} isEvaluated={isEvaluated} />}
        </div>)}
      </div>
    </section>

    <section aria-label="General feedback" className="space-y-3 rounded-xl border border-blue-500/30 bg-blue-950/20 p-4 sm:p-5">
      <div className="border-b border-blue-800/40 pb-3"><h3 className="text-lg font-semibold text-white">General Feedback</h3></div>
      <div className="flex flex-col gap-3">
        {renderGeneralField("comments", "Personalized Feedback & Corrections", comments, "Provide detailed feedback for the student...")}
        {renderGeneralField("strengths", "Strengths", strengths, "Record specific strengths or successful choices...")}
        {renderGeneralField("areasToImprove", "Areas to Improve", areasToImprove, "List focused next steps or recurring issues...")}
        {renderGeneralField("studyHubPrescription", "Study Hub Prescription", studyHubPrescription, "Add a resource link or recommended topic...")}
      </div>
    </section>

    {submitError && <p role="alert" className="rounded-lg border border-red-700 bg-red-900/30 p-3 text-xs text-red-200">{submitError}</p>}
    {isInstructorView && <button type="button" onClick={onPublish} disabled={isSubmitting || isSubmitted} className="w-full rounded-lg bg-amber-500/20 px-6 py-3 text-sm  text-amber-400 transition hover:bg-amber-500/20 disabled:cursor-wait disabled:opacity-50">
      {isSubmitting ? "Saving..." : isSubmitted ? "Evaluation Published" : "Publish Evaluation & Send to Student"}
    </button>}
  </div>;
}