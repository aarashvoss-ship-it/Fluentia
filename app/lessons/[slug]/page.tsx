"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChatMessage, ContentBlock, SavedVocabularyWord, StudentNote, StudyStepId, STUDY_STEPS, LessonContent, StudentSubmission } from "@/types/lesson";
import { MOCK_INSTRUCTOR_LESSONS } from "@/lib/mock-instructor-data";
import { getLesson } from "@/lib/lessons";
import { persistActiveStudentToken, PublishedLessonState, resolveActiveStudent, writeLastAccessedLesson } from "@/lib/lesson-store";
import { fetchChatMessages, fetchLesson, fetchLessonState, fetchSavedVocabulary, fetchStudentNotes, fetchStudentProgress, saveChatMessage, saveStudentNote, submitStudentLesson, removeVocabularyWord, saveVocabularyWord } from "@/services/storage-service";
import { DEFAULT_STUDENT } from "@/lib/users";
import { Stepper } from "@/components/study-room/stepper";
import { CelebrationModal } from "@/components/study-room/celebration-modal";
import { DictionaryModal } from "@/components/study-room/dictionary-modal";
import { LearningSidebar } from "@/components/study-room/learning-sidebar";
import { ChatWidget } from "@/components/study-room/chat-widget";
import { AmbientMusicPlayer } from "@/components/study-room/ambient-music-player";
import {
  ArrowRight,
  ChevronRight,
  Sparkles,
  BookOpen,
  Headphones,
  FileText,
  PenTool,
  Mic,
  Award,
  BookOpen as DictionaryIcon,
  PanelRight,
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

function getInitialStudent() {
  if (typeof window === "undefined") return DEFAULT_STUDENT;
  const params = new URLSearchParams(window.location.search);
  return resolveActiveStudent(params.get("student") || params.get("token"));
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

export default function LessonPage() {
  const rawSlug = useParams()?.slug;
  const requestedSlug = typeof rawSlug === "string" ? rawSlug : "habits-01";
  const [mockLesson, setMockLesson] = useState<LessonContent>(() => getLesson(requestedSlug));
  const [lessonReady, setLessonReady] = useState(false);
  const [lessonNotFound, setLessonNotFound] = useState(false);
  const instructorLesson = MOCK_INSTRUCTOR_LESSONS[mockLesson.slug] || MOCK_INSTRUCTOR_LESSONS["habits-01"];
  const instructor = mockLesson.instructor || instructorLesson.instructor || { fullName: "AVoss", initials: "AV" };
  const [activeStudent, setActiveStudent] = useState(getInitialStudent);
  const [studentReady] = useState(true);
  const [currentStep, setCurrentStep] = useState<StudyStepId>("warm_up");
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
  const [savedWords, setSavedWords] = useState<SavedVocabularyWord[]>([]);
  const [notes, setNotes] = useState<StudentNote[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [dictionaryWord, setDictionaryWord] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    persistActiveStudentToken(params.get("student") || params.get("token"));
  }, []);

  useEffect(() => {
    let mounted = true;
    setLessonReady(false);
    setLessonNotFound(false);
    void fetchLesson(requestedSlug).then((lesson) => {
      if (!mounted) return;
      if (lesson) {
        setMockLesson(lesson);
        writeLastAccessedLesson(lesson.slug, activeStudent.token);
      } else {
        setLessonNotFound(true);
      }
      setLessonReady(true);
    });
    return () => {
      mounted = false;
    };
  }, [requestedSlug]);

  useEffect(() => {
    if (!lessonReady || !studentReady || lessonNotFound) return;
    const params = new URLSearchParams(window.location.search);
    const requestedStep = getRequestedStep(params.get("step"));
    const startStep = params.get("start");
    void Promise.all([
      fetchLessonState(mockLesson.slug, activeStudent.token),
      fetchStudentProgress(mockLesson.slug, activeStudent.token),
    ]).then(([state, progress]) => {
      setPublishedLesson(state?.status !== "draft" ? state : null);
      if (state?.submission) setSubmission(state.submission);
      setCurrentStep(requestedStep || (startStep === "warm_up" ? "warm_up" : progress.currentStep));
      setCompletedSteps(progress.completedSteps);
    });
  }, [activeStudent.token, lessonReady, lessonNotFound, mockLesson.slug, studentReady]);

  useEffect(() => {
    void Promise.all([
      fetchSavedVocabulary(activeStudent.token),
      fetchStudentNotes(activeStudent.token),
      fetchChatMessages(activeStudent.token),
    ]).then(([words, savedNotes, messages]) => {
      setSavedWords(words);
      setNotes(savedNotes);
      setChatMessages(messages);
    });
  }, [activeStudent.token]);

  function handleDoubleClick() {
    const selection = window.getSelection()?.toString().trim().split(/\s+/)[0]?.replace(/[^a-zA-Z'-]/g, "");
    if (selection && selection.length > 1) setDictionaryWord(selection);
  }

  async function persistSubmission(nextSubmission: StudentSubmission, nextProgress?: { currentStep?: StudyStepId; completedSteps?: StudyStepId[]; status?: "not_started" | "in_progress" | "submitted" | "reviewed" }) {
    setSubmission(nextSubmission);
    await submitStudentLesson(mockLesson.slug, activeStudent.token, nextSubmission, {
      currentStep: nextProgress?.currentStep || currentStep,
      completedSteps: nextProgress?.completedSteps || completedSteps,
      status: nextProgress?.status || (nextSubmission.status === "submitted" ? "submitted" : "in_progress"),
      updatedAt: new Date().toISOString(),
    });
  }

  const lessonContent = publishedLesson?.content || mockLesson.content || instructorLesson.content;
  const heroBanner = publishedLesson?.bannerUrl || instructorLesson.banner_image_url;
  const evaluation = publishedLesson?.evaluation;
  const isEvaluationPublished = evaluation?.published === true;
  const totalScore = evaluation
    ? Object.values(evaluation.scores).reduce<number>((total, score) => total + Number(score), 0)
    : 0;
  const resultRows = [
    ...(lessonContent.listening?.questions || []).map((question: { id: string; question: string; correct_answer?: string }) => ({
      task: `Listening: ${question.question}`,
      response: submission.listeningAnswers[question.id] || "No answer submitted",
      answer: question.correct_answer || "Model answer pending",
      feedback: isEvaluationPublished
        ? evaluation?.comments || "Reviewed by instructor"
        : "Pending instructor review",
    })),
    ...(lessonContent.reading?.analytical_questions || []).map((question: { id: string; question: string }) => ({
      task: `Reading: ${question.question}`,
      response: submission.readingAnswers[question.id] || "No answer submitted",
      answer: "Explain the author’s distinction using evidence from the article.",
      feedback: isEvaluationPublished
        ? evaluation?.comments || "Reviewed by instructor"
        : "Pending instructor review",
    })),
    {
      task: "Writing: Habit architecture response",
      response: submission.writingText || "No written response submitted",
      answer: lessonContent.writing?.prompt?.text || "Use cue, routine, reward, and friction in your response.",
      feedback: isEvaluationPublished
        ? evaluation?.comments || "Reviewed by instructor"
        : "Pending instructor review",
    },
    {
      task: "Speaking: Oral summary",
      response: submission.speakingAudioUrl || "No recording submitted",
      answer: lessonContent.speaking?.scenario?.text || "Give a clear summary with two concrete suggestions.",
      feedback: isEvaluationPublished
        ? evaluation?.comments || "Reviewed by instructor"
        : "Pending instructor review",
    },
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
    await persistSubmission({ ...submission, status: "submitted", submittedAt: new Date().toISOString() }, { currentStep: "results", completedSteps: [...STUDY_STEPS.map((step) => step.id)], status: "submitted" });
    setCurrentStep("results");
  }

  const isResultsStep = currentStep === "results";

  if (!lessonReady || !studentReady) {
    return <div className="fluentia-study-room min-h-screen bg-[#0c1017] text-[#e8e7e4]" />;
  }

  if (lessonNotFound) {
    return (
      <div className="fluentia-study-room min-h-screen bg-[#0c1017] px-5 py-16 text-center text-[#e8e7e4]">
        <h1 className="font-[var(--font-fraunces)] text-2xl text-[#f1eee8]">Lesson unavailable</h1>
        <p className="mt-3 text-sm text-[#8f98a8]">This lesson is no longer published.</p>
        <Link href={`/dashboard?student=${encodeURIComponent(activeStudent.token || activeStudent.id)}`} className="mt-6 inline-flex rounded-md bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950">Return to Dashboard</Link>
      </div>
    );
  }

  const getVideoEmbedUrl = (url: string) => {
    try {
      const parsed = new URL(url);
      if (parsed.hostname.includes("youtu.be")) return `https://www.youtube.com/embed/${parsed.pathname.slice(1)}`;
      if (parsed.hostname.includes("youtube.com")) {
        const videoId = parsed.searchParams.get("v");
        return videoId ? `https://www.youtube.com/embed/${videoId}` : url;
      }
    } catch {
      return url;
    }
    return url;
  };

  const renderDynamicBlocks = (blocks: ContentBlock[]) => (
    <div className="space-y-5">
      {blocks.filter((block) => block.enabled !== false).map((block) => (
        <article key={block.id} className="rounded-xl border border-[#202631] bg-[#121721] p-5">
          {block.title && <h3 className="mb-3 font-[var(--font-fraunces)] text-xl font-semibold text-stone-100">{block.title}</h3>}
          {block.type === "text" && <><p className="whitespace-pre-wrap text-sm leading-relaxed text-stone-300">{block.body}</p><textarea value={submission.blockResponses?.[block.id] || ""} onChange={(event) => void persistSubmission({ ...submission, blockResponses: { ...(submission.blockResponses || {}), [block.id]: event.target.value } })} rows={3} placeholder="Write your response here..." className="mt-4 w-full resize-none rounded-lg border border-[#202631] bg-[#0c1017] p-3 text-sm text-stone-200 outline-none focus:border-amber-500" aria-label={`${block.title || "Text"} response`} /></>}
          {block.type === "audio" && <>{block.audioUrl ? <audio controls src={block.audioUrl} className="w-full" /> : <div className="rounded border border-dashed border-[#394252] p-4 text-xs text-stone-500">Audio recording placeholder</div>}<input value={submission.audioUploads?.[block.id] || ""} onChange={(event) => void persistSubmission({ ...submission, audioUploads: { ...(submission.audioUploads || {}), [block.id]: event.target.value } })} placeholder="Paste recording URL or upload reference" className="mt-3 w-full rounded-lg border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-stone-200 outline-none focus:border-amber-500" aria-label={`${block.title || "Audio"} recording URL`} /></>}
          {block.type === "video" && (block.videoUrl ? <div className="aspect-video overflow-hidden rounded-lg border border-[#202631] bg-[#0c1017]"><iframe src={getVideoEmbedUrl(block.videoUrl)} title={block.title || "Lesson video"} className="h-full w-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /></div> : <div className="rounded border border-dashed border-[#394252] p-4 text-xs text-stone-500">Video embed placeholder</div>)}
          {block.type === "image" && (block.imageUrl ? <figure><img src={block.imageUrl} alt={block.title} className="max-h-[420px] w-full rounded-lg object-cover" />{block.caption && <figcaption className="mt-2 text-xs text-stone-500">{block.caption}</figcaption>}</figure> : <div className="rounded border border-dashed border-[#394252] p-4 text-xs text-stone-500">Image placeholder</div>)}
          {block.type === "quiz" && <div className="space-y-4">{block.questions.map((question) => <div key={question.id}><p className="text-sm text-stone-300">{question.prompt}</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{question.options.map((option) => <button key={option} type="button" onClick={() => void persistSubmission({ ...submission, quizSelections: { ...(submission.quizSelections || {}), [question.id]: option } })} className={`rounded-md border px-3 py-2 text-left text-xs transition ${submission.quizSelections?.[question.id] === option ? "border-amber-500 bg-amber-500/10 text-amber-300" : "border-[#202631] bg-[#0c1017] text-stone-400 hover:border-amber-500/50 hover:text-amber-300"}`}>{option}</button>)}</div></div>)}</div>}
        </article>
      ))}
    </div>
  );

  return (
    <div className="fluentia-study-room min-h-screen bg-[#0c1017] text-[#e8e7e4]" onDoubleClick={handleDoubleClick}>
      <div className="mx-auto max-w-[920px] px-5 sm:px-0">
      {!isResultsStep && (
        <section className="relative h-[295px] overflow-hidden border-b border-[#202631]">
          <img
            src={heroBanner || mockLesson.coverImage}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-55"
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(7,11,17,.72),rgba(7,11,17,.08)_55%,rgba(7,11,17,.72)),linear-gradient(0deg,#0c1017_0%,transparent_58%)]" />
          <div className="relative flex h-full flex-col justify-end pb-14">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#aeb3b9]">
              English B1
            </p>
            <span className="mb-3 w-fit rounded-sm border border-[#a77b25] bg-[#332713]/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#dca42f]">
              Module {mockLesson.moduleNumber}
            </span>
            <h1 className="font-[var(--font-fraunces)] text-[38px] leading-[0.98] tracking-[-0.02em] text-[#f1eee8] sm:text-[42px]">
              {mockLesson.title}
            </h1>
            <p className="mt-4 text-xs text-[#b5bac2]">{mockLesson.subtitle || "Seven stages. One connected journey."}</p>
            <div className="mt-7 flex items-center gap-2 text-[11px] text-[#9ba1aa]">
              {instructor.avatarUrl ? <img src={instructor.avatarUrl} alt="" className="h-6 w-6 rounded-full object-cover" /> : <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#283344] text-[9px] font-semibold text-[#d9a63b]">{instructor.initials}</span>}
              Guided by {instructor.fullName}
            </div>
          </div>
        </section>
      )}

      <header className="pt-8">
        <div className="flex items-center justify-between text-[12px]">
              <p className="text-[#aeb2b9]">Welcome back, <span className="text-[#e6e4e0]">{activeStudent.name}</span>.</p>
          <div className="flex items-center gap-2"><AmbientMusicPlayer src={mockLesson.ambientMusicUrl} /><button type="button" onClick={() => setDictionaryWord("")} aria-label="Open dictionary" className="flex h-8 w-8 items-center justify-center rounded-md border border-[#394252] bg-[#171d28] text-stone-400 transition hover:border-amber-500 hover:text-amber-300"><DictionaryIcon className="h-4 w-4" /></button><button type="button" onClick={() => setSidebarOpen((open) => !open)} aria-expanded={sidebarOpen} aria-controls="learning-sidebar" className={`flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs transition ${sidebarOpen ? "border-amber-500/70 bg-amber-500/10 text-amber-300" : "border-[#394252] bg-[#171d28] text-amber-300 hover:border-amber-500"}`}><PanelRight className="h-3.5 w-3.5" />Learning Hub</button><Link href={`/dashboard?token=${encodeURIComponent(activeStudent.token || activeStudent.id)}`} className="flex items-center gap-1 text-[#646d7b] transition-colors hover:text-[#bdc1c8]"><ChevronRight className="h-3 w-3 rotate-180" />Course overview</Link></div>
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

      <main className="pb-10 pt-8 text-[15px] leading-relaxed">
        {/* Hero Banner */}
        <div className="border-t border-[#202631]" />

        {/* Step Content */}
        <div className="space-y-7 pt-9">
          {/* Warm Up */}
          {currentStep === "warm_up" && (
            <section className="space-y-5">
              {lessonContent.warm_up?.blocks?.length ? renderDynamicBlocks(lessonContent.warm_up.blocks) : <>
              <div id="lesson-content" className="flex items-center gap-2 text-[#d99d22]">
                <Sparkles className="h-3.5 w-3.5 fill-current" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">Warm-up</span>
              </div>
              <p className="max-w-[570px] text-[16px] leading-[1.65] text-[#aeb3bb]">
                {lessonContent.warm_up?.intro_narrative?.text || "Small habits shape our days, often without us noticing."}
              </p>
              <h3 className="pt-4 font-[var(--font-fraunces)] text-[27px] font-semibold leading-[1.18] text-[#eeeae3]">
                {lessonContent.warm_up?.quote?.text || "Think about one habit that makes your day easier."}
              </h3>
              <div className="space-y-2 text-sm text-[#aeb3bb]">
                {(lessonContent.warm_up?.quick_prompts || []).map((prompt: { text: string }) => (
                  <p key={prompt.text}>{prompt.text}</p>
                ))}
              </div>
              <p className="text-[12px] leading-relaxed text-[#596174]">You don&apos;t need to write a perfect answer. Just start with your own experience.</p>
              <textarea
                className="mt-2 w-full resize-none rounded-[10px] border border-[#29303c] bg-[#171d28] px-5 py-5 text-[15px] leading-relaxed text-[#d9dce0] placeholder-[#7b8290] shadow-[0_8px_24px_rgba(0,0,0,.12)] transition-colors placeholder:text-[13px] focus:border-[#8d702f] focus:outline-none focus:ring-1 focus:ring-[#8d702f]/30"
                rows={4}
                placeholder="For example: Making my bed first thing in the morning..."
              />
              {lessonContent.warm_up?.lexicon_notes?.text && (
                <p id="lexicon-notes" className="text-[12px] leading-relaxed text-amber-400">
                  {lessonContent.warm_up.lexicon_notes.text}
                </p>
              )}
              <p className="-mt-2 text-[11px] leading-relaxed text-[#4f586d]">Your response is private and helps you connect with the topic.</p>
              </>}
            </section>
          )}

          {/* Lesson */}
          {currentStep === "lesson" && (
            <section className="space-y-4">
              {lessonContent.lesson?.blocks?.length ? renderDynamicBlocks(lessonContent.lesson.blocks) : <>
              <div className="flex items-center gap-2 text-amber-400">
                <BookOpen className="w-5 h-5" />
                <span className="text-xs font-semibold uppercase tracking-wider">
                  Core Lesson
                </span>
              </div>
              <h3 className="text-xl font-semibold text-stone-100">
                {lessonContent.lesson?.core_concept?.text || "The Habit Loop Anatomy"}
              </h3>
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
              <div className="flex items-center gap-2 text-amber-400">
                <Headphones className="w-5 h-5" />
                <span className="text-xs font-semibold uppercase tracking-wider">
                  Audio Immersion
                </span>
              </div>
              <h3 className="text-xl font-semibold text-stone-100">
                {lessonContent.listening?.transcript?.text || "Friction as Architecture"}
              </h3>
              <div className="bg-stone-900 border border-stone-800 rounded-xl p-5 flex items-center gap-4">
                <button className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 hover:bg-amber-500/20 transition-colors">
                  ▶
                </button>
                <div className="flex-1 h-1.5 bg-stone-800 rounded-full" />
                <span className="text-xs text-stone-500 tabular-nums">
                  {lessonContent.listening?.audio_meta?.speaker || "Audio lesson"}
                </span>
              </div>
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
              <div className="flex items-center gap-2 text-amber-400">
                <FileText className="w-5 h-5" />
                <span className="text-xs font-semibold uppercase tracking-wider">
                  Reading
                </span>
              </div>
              <h3 className="text-xl font-semibold text-stone-100">
                Architectural Cue Management
              </h3>
              <blockquote className="border-l-2 border-amber-500/40 pl-4 text-stone-400 text-sm leading-relaxed italic">
                {lessonContent.reading?.article_markdown?.text || "Architectural Cue Management"}
              </blockquote>
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
              <div className="flex items-center gap-2 text-amber-400">
                <PenTool className="w-5 h-5" />
                <span className="text-xs font-semibold uppercase tracking-wider">
                  Writing Task
                </span>
              </div>
              <h3 className="text-xl font-semibold text-stone-100">
                Deliberate Writing Task
              </h3>
              <p className="text-stone-400 text-sm leading-relaxed">
                {lessonContent.writing?.prompt?.text || "Describe one habit you want to build."}
              </p>
              <textarea
                value={submission.writingText}
                onChange={(event) => persistSubmission({ ...submission, writingText: event.target.value })}
                className="w-full bg-stone-900 border border-stone-700/60 rounded-xl px-4 py-3 text-sm text-stone-200 placeholder-stone-600 resize-none focus:outline-none focus:ring-1 focus:ring-amber-500/40 focus:border-amber-500/40 transition-colors"
                rows={6}
                placeholder={lessonContent.writing?.draft_editor?.placeholder || "Write your response here..."}
              />
              </>}
            </section>
          )}

          {/* Speaking */}
          {currentStep === "speaking" && (
            <section className="space-y-4">
              {lessonContent.speaking?.blocks?.length ? renderDynamicBlocks(lessonContent.speaking.blocks) : <>
              <div className="flex items-center gap-2 text-amber-400">
                <Mic className="w-5 h-5" />
                <span className="text-xs font-semibold uppercase tracking-wider">
                  Speaking
                </span>
              </div>
              <h3 className="text-xl font-semibold text-stone-100">
                Oral Summary Submission
              </h3>
              <p className="text-stone-400 text-sm leading-relaxed">
                {lessonContent.speaking?.scenario?.text || "Record a 60-second summary of your key takeaways from this lesson."}
              </p>
              <div className="space-y-2 text-left text-sm text-stone-400">
                {(lessonContent.speaking?.discussion_points || []).map((point: { text: string }) => (
                  <p key={point.text}>{point.text}</p>
                ))}
              </div>
              <div className="bg-stone-900 border border-stone-800 rounded-xl p-5 flex items-center justify-center h-28">
                <button className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm hover:bg-amber-500/20 transition-colors">
                  <Mic className="w-4 h-4" />
                  Start Recording
                </button>
              </div>
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
                <p className="text-stone-400 text-sm">
                  {lessonContent.results?.self_reflection?.text || `Outstanding work, ${activeStudent.name}. Your instructor will review your submission shortly.`}
                </p>
              </div>
              <div className="overflow-hidden rounded-xl border border-[#202631] bg-[#121721] text-left">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-xs text-stone-300">
                    <thead className="border-b border-[#202631] text-[10px] uppercase tracking-[0.14em] text-stone-500">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Task / Step</th>
                        <th className="px-4 py-3 font-semibold">Your Response</th>
                        <th className="px-4 py-3 font-semibold">Correct Answer / Model Answer</th>
                        <th className="px-4 py-3 font-semibold">Instructor Feedback</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#202631]">
                      {resultRows.map((row) => (
                        <tr key={row.task} className="align-top">
                          <td className="px-4 py-4 font-medium text-stone-200">{row.task}</td>
                          <td className="px-4 py-4 text-stone-400">{row.response}</td>
                          <td className="px-4 py-4 text-stone-400">{row.answer}</td>
                          <td className="px-4 py-4 text-amber-300">{row.feedback}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
                    <p>{isEvaluationPublished ? evaluation?.comments : "Your instructor has not published feedback yet. Check back after your work has been reviewed."}</p>
                    {isEvaluationPublished && (
                      <div className="grid gap-4 border-t border-[#202631] pt-4 sm:grid-cols-2">
                        <div><p className="text-xs font-semibold text-stone-300">Strengths</p><p className="mt-1 whitespace-pre-wrap">{evaluation?.strengths || "No strengths recorded."}</p></div>
                        <div><p className="text-xs font-semibold text-stone-300">Areas to Improve</p><p className="mt-1 whitespace-pre-wrap">{evaluation?.areasToImprove || "No improvement areas recorded."}</p></div>
                        <div><p className="text-xs font-semibold text-stone-300">Study Hub Prescription</p><p className="mt-1 whitespace-pre-wrap text-amber-300">{evaluation?.studyHubPrescription || "No prescription recorded."}</p></div>
                        {evaluation?.voiceFeedbackUrl && <div><p className="text-xs font-semibold text-stone-300">Voice Feedback</p><a href={evaluation.voiceFeedbackUrl} className="mt-1 block truncate text-amber-300">{evaluation.voiceFeedbackUrl}</a></div>}
                      </div>
                    )}
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">Recommended review</p>
                      <div className="flex flex-wrap gap-2">
                        <a href="#lexicon-notes" className="rounded-md border border-amber-500/20 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-300 hover:bg-amber-500/20">Review lexicon notes</a>
                        <a href="#lesson-content" className="rounded-md border border-[#394252] bg-[#171d28] px-2.5 py-1.5 text-xs text-stone-300 hover:border-amber-500/40">Revisit lesson content</a>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="text-center">
                <Link href={`/dashboard?student=${encodeURIComponent(activeStudent.token || activeStudent.id)}`} className="inline-flex items-center gap-2 rounded-full border border-stone-700 bg-stone-800 px-5 py-2.5 text-sm text-stone-200 transition-colors hover:bg-stone-700">
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

      <CelebrationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleSubmitFinal}
        onReview={handleReviewAnswers}
        studentName={activeStudent.name || "Arash"}
        dashboardHref={`/dashboard?student=${encodeURIComponent(activeStudent.token || activeStudent.id)}`}
      />
      <LearningSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        words={savedWords}
        notes={notes}
        resource={evaluation?.studyHubPrescription}
        onSaveNote={(note) => {
          setNotes([note, ...notes.filter((item) => item.id !== note.id)]);
          void saveStudentNote(activeStudent.token, note);
        }}
        onRemoveWord={(word) => {
          setSavedWords(savedWords.filter((item) => item.word.toLowerCase() !== word.toLowerCase()));
          void removeVocabularyWord(activeStudent.token, word);
        }}
      />
      <ChatWidget
        messages={chatMessages}
        onSend={(message) => {
          setChatMessages([...chatMessages, message]);
          void saveChatMessage(activeStudent.token, message);
        }}
      />
      {dictionaryWord !== null && (
        <DictionaryModal
          initialWord={dictionaryWord}
          savedWords={savedWords}
          onClose={() => setDictionaryWord(null)}
          onSave={(word) => {
            setSavedWords([word, ...savedWords.filter((item) => item.word.toLowerCase() !== word.word.toLowerCase())]);
            void saveVocabularyWord(activeStudent.token, word);
          }}
        />
      )}
      <button aria-label="Help" className="fixed bottom-3 right-3 flex h-7 w-7 items-center justify-center rounded-full border border-[#3a3e45] bg-[#25282d] text-xs text-[#b5b7ba] shadow-lg">
        ?
      </button>
    </div>
  );
}
