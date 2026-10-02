"use client";

import { CustomAudioPlayer } from "@/components/study-room/custom-audio-player";

export interface UnifiedReportTask {
  id: string;
  title: string;
  studentAnswer: string;
  modelAnswer?: string;
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
  isEvaluated: boolean;
  scores: Record<string, number>;
  criterionFeedback: Record<string, string>;
  stageFeedback: Record<string, string>;
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
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1$2")
    .replace(/(^|[^_])_([^_\n]+)_(?!_)/g, "$1$2")
    .replace(/[*_~`]/g, "")
    .trim();
}

function FeedbackValue({ value, isEvaluated }: { value?: string; isEvaluated: boolean }) {
  return <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-stone-300">{value?.trim() || <span className="italic text-stone-500">{isEvaluated ? "No comment provided." : "Pending Review"}</span>}</p>;
}

export function UnifiedReportCard({
  stages,
  isInstructorView,
  isEvaluated,
  scores,
  criterionFeedback,
  stageFeedback,
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
  const totalScore = RUBRIC_CRITERIA.reduce((total, criterion) => total + Number(scores[criterion.id] || 0), 0);

  const renderGeneralField = (
    field: "comments" | "strengths" | "areasToImprove" | "studyHubPrescription",
    label: string,
    value?: string,
    placeholder = "",
  ) => <div key={field} className="rounded-lg border border-[#293343] bg-[#0c1017] p-4">
    <p className="text-xs font-semibold text-stone-300">{label}</p>
    {isInstructorView ? <textarea
      value={value || ""}
      onChange={(event) => onGeneralFeedbackChange?.(field, event.target.value)}
      placeholder={placeholder}
      rows={4}
      className="mt-2 w-full resize-y rounded-md border border-[#394252] bg-[#171d28] p-3 text-sm leading-relaxed text-stone-200 outline-none focus:border-amber-500/40"
    /> : <FeedbackValue value={value} isEvaluated={isEvaluated} />}
  </div>;

  return <div className="w-full space-y-8 text-left">
    <section aria-label="Report card tasks" className="space-y-4">
      <div className="flex items-end justify-between gap-4 border-b border-[#202631] pb-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">{isInstructorView ? "Submission Report Card" : "Results & Review"}</p>
          <h2 className="mt-1 text-xl font-semibold text-stone-100">Lesson Tasks</h2>
        </div>
      </div>
      <div className="flex w-full min-w-0 flex-col gap-4">
        {stages.map((stage) => <section key={stage.id} className="w-full min-w-0 space-y-3 rounded-xl border border-[#202631] bg-[#171d28]/60 p-5">
          <div className="border-b border-[#293343] pb-3">
            <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-amber-400">{stage.title}</h3>
            {stage.prompt && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-stone-400">{stripMarkdown(stage.prompt)}</p>}
          </div>
          {(stage.referenceText || stage.referenceAudioUrl) && <details className="mb-4 rounded-lg border border-slate-800 bg-slate-900/50 p-4">
            <summary className="cursor-pointer text-sm font-medium text-stone-200">Show Lesson Reference / Passage</summary>
            {stage.referenceText && <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-stone-300">{stripMarkdown(stage.referenceText)}</p>}
            {stage.referenceAudioUrl && <div className="mt-3"><CustomAudioPlayer src={stage.referenceAudioUrl} label={`${stage.title} lesson reference audio`} /></div>}
          </details>}
          {stage.tasks.length > 0 ? <div className="space-y-3">
            {stage.tasks.map((task, index) => <article key={task.id} className="w-full min-w-0 rounded-lg border border-[#293343] bg-[#0c1017] p-4">
              <div className="rounded-md bg-zinc-900 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">Task Prompt</p>
                <h4 className="mt-1 text-sm font-medium leading-relaxed text-stone-100">{index + 1}. {stripMarkdown(task.title)}</h4>
              </div>
              <div className="mt-3 rounded-md bg-zinc-900/70 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">Your Response</p>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-stone-300">{stripMarkdown(task.studentAnswer) || <span className="italic text-stone-500">No response submitted.</span>}</p>
                {task.audioUrls?.map((url, mediaIndex) => <div key={`${url}-${mediaIndex}`} className="mt-2 min-w-0 max-w-full overflow-hidden"><CustomAudioPlayer src={url} label={`${stripMarkdown(task.title)} recording`} /></div>)}
              </div>
              {task.modelAnswer && <div className="mt-3 rounded-md border border-amber-900/40 bg-amber-950/20 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-400">Correct / Model Answer</p>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-amber-200">{stripMarkdown(task.modelAnswer)}</p>
              </div>}
              {task.explanation && <div className="mt-3 border-t border-[#293343] pt-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">Explanation</p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-stone-400">{stripMarkdown(task.explanation)}</p>
              </div>}
            </article>)}
          </div> : <div className="rounded-lg border border-dashed border-[#394252] bg-[#0c1017]/60 px-4 py-5 text-center">
            <p className="text-sm font-medium text-stone-300">Instructional Step Completed</p>
            <p className="mt-1 text-xs leading-relaxed text-stone-500">This stage focused on learning content and required no interactive response.</p>
          </div>}
          <div className={`rounded-lg border p-4 ${isInstructorView ? "border-[#394252] bg-[#0c1017]" : "border-[#293343] bg-[#121721]"}`}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">Instructor Task Feedback</p>
            {isInstructorView ? <textarea
              value={stageFeedback[stage.id] || ""}
              onChange={(event) => onStageFeedbackChange?.(stage.id, event.target.value)}
              placeholder="Add feedback for this section (optional)..."
              rows={3}
              className="mt-2 w-full resize-y rounded-md border border-[#394252] bg-[#171d28] p-3 text-sm text-stone-200 outline-none focus:border-amber-500/40"
            /> : stageFeedback[stage.id]?.trim() ? <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-stone-300">{stageFeedback[stage.id]}</p> : <p className="mt-1 text-sm text-stone-500">{isEvaluated ? "No comment provided." : "Pending Instructor Review"}</p>}
          </div>
        </section>)}
      </div>
    </section>

    <section aria-label="Rubric ratings" className="space-y-3">
      <div className="flex items-center justify-between border-b border-[#202631] pb-3">
        <h3 className="text-lg font-semibold text-stone-100">Rubric Ratings</h3>
        <span className="text-xs text-amber-400">Total: {totalScore}/20</span>
      </div>
      <div className="flex flex-col gap-3">
        {RUBRIC_CRITERIA.map((criterion) => <div key={criterion.id} className="space-y-3 rounded-lg border border-[#202631] bg-[#0c1017] p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-stone-300">{criterion.label}</span>
            <span className="text-sm font-semibold text-amber-400">{!isInstructorView && !isEvaluated && scores[criterion.id] === undefined ? "Pending Review" : `${scores[criterion.id] ?? 0}/5`}</span>
          </div>
          {isInstructorView ? <>
            <input type="range" min="1" max="5" step="1" value={scores[criterion.id] || 0} onChange={(event) => onScoreChange?.(criterion.id, Number(event.target.value))} className="w-full accent-amber-500" aria-label={`${criterion.label} score`} />
            <div className="flex items-center gap-1">{[1, 2, 3, 4, 5].map((score) => <button key={score} type="button" onClick={() => onScoreChange?.(criterion.id, score)} className={`h-7 flex-1 rounded text-xs  ${scores[criterion.id] === score ? "bg-amber-500/20 text-amber-400" : "bg-[#171d28] text-stone-400 hover:text-white"}`}>{score}</button>)}</div>
            <textarea value={criterionFeedback[criterion.id] || ""} onChange={(event) => onCriterionFeedbackChange?.(criterion.id, event.target.value)} placeholder={`Written feedback for ${criterion.label.toLowerCase()}...`} rows={2} className="w-full resize-y rounded-md border border-[#394252] bg-[#171d28] p-2.5 text-xs text-stone-200 outline-none focus:border-amber-500/40" aria-label={`${criterion.label} feedback`} />
          </> : <FeedbackValue value={criterionFeedback[criterion.id]} isEvaluated={isEvaluated} />}
        </div>)}
      </div>
    </section>

    <section aria-label="General feedback" className="space-y-3">
      <div className="border-b border-[#202631] pb-3"><h3 className="text-lg font-semibold text-stone-100">General Feedback</h3></div>
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