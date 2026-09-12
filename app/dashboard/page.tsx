"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BookOpen, CheckCircle2, Clock3, Layers3, MessageSquareText, PanelRight, Settings2, UserRound } from "lucide-react";
import { DEFAULT_STUDENT, findUser, StudentUser } from "@/lib/users";
import { PublishedLessonState } from "@/lib/lesson-store";
import { fetchChatMessages, fetchLessonState, fetchLessons, fetchSavedVocabulary, fetchStudentNotes, removeVocabularyWord, saveChatMessage, saveStudentNote, saveVocabularyWord } from "@/services/storage-service";
import { ChatMessage, SavedVocabularyWord, StudentNote } from "@/types/lesson";
import { DictionaryModal } from "@/components/study-room/dictionary-modal";
import { LearningSidebar } from "@/components/study-room/learning-sidebar";
import { ChatWidget } from "@/components/study-room/chat-widget";

type LessonStatus = "not-started" | "in-progress" | "pending-review" | "completed";

function getLessonStatus(state?: PublishedLessonState | null): LessonStatus {
  if (!state || state.status === "draft") return "not-started";
  if (state.submission?.status === "reviewed" || state.evaluation.published) return "completed";
  if (state.submission?.status === "submitted") return "pending-review";
  if (state.submission?.status === "in_progress") return "in-progress";
  return "not-started";
}

export default function DashboardPage() {
  const [activeStudent, setActiveStudent] = useState(DEFAULT_STUDENT);
  const [lessons, setLessons] = useState<Awaited<ReturnType<typeof fetchLessons>>>([]);
  const [lessonStates, setLessonStates] = useState<Record<string, PublishedLessonState | null>>({});
  const [savedWords, setSavedWords] = useState<SavedVocabularyWord[]>([]);
  const [cardIndex, setCardIndex] = useState(0);
  const [showDefinition, setShowDefinition] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dictionaryOpen, setDictionaryOpen] = useState(false);
  const [notes, setNotes] = useState<StudentNote[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    const loadDashboard = async (studentToken: string) => {
      const availableLessons = (await fetchLessons()).filter((lesson) => lesson.status !== "draft");
      setLessons(availableLessons);
      setLessonStates(Object.fromEntries(await Promise.all(availableLessons.map(async (lesson) => [lesson.slug, await fetchLessonState(lesson.slug, studentToken)]))));
      setSavedWords(await fetchSavedVocabulary(studentToken));
      const [studentNotes, messages] = await Promise.all([fetchStudentNotes(studentToken), fetchChatMessages(studentToken)]);
      setNotes(studentNotes);
      setChatMessages(messages);
    };
    const params = new URLSearchParams(window.location.search);
    const requestedUser = findUser(params.get("token") || params.get("student"));
    const storedUser = findUser(window.localStorage.getItem("fluentia:active-user"));
    const student = requestedUser?.role === "student" ? requestedUser : storedUser;
    const active = student?.role === "student" ? student as StudentUser : DEFAULT_STUDENT;
    const studentToken = active.token || active.id || DEFAULT_STUDENT.token;

    setActiveStudent(active);
    window.localStorage.setItem("fluentia:active-user", studentToken);
    const refreshLessons = () => void loadDashboard(studentToken);
    void loadDashboard(studentToken);
    window.addEventListener("storage", refreshLessons);
    return () => window.removeEventListener("storage", refreshLessons);
  }, []);

  const token = activeStudent.token || activeStudent.id;
  const completedLessons = lessons.filter(
    (lesson) => getLessonStatus(lessonStates[lesson.slug]) === "completed"
  ).length;
  const hasPendingReview = lessons.some(
    (lesson) => getLessonStatus(lessonStates[lesson.slug]) === "pending-review"
  );
  const hasFeedback = completedLessons > 0;
  const instructorNote =
    lessonStates[lessons[0]?.slug]?.studentProfile.teacherNotes ||
    activeStudent.profile?.teacherNotes ||
    "Your instructor will add personalized guidance here.";
  const latestReport = lessonStates[lessons[0]?.slug]?.evaluation;
  const currentCard = savedWords[cardIndex % Math.max(savedWords.length, 1)];
  const displayName = activeStudent.name === "Arash Test" ? "Arash Vossoughi" : activeStudent.name;
  const profileInitials = displayName.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  const getLessonHref = (slug: string, status: LessonStatus) => {
    const startParam = status === "completed" || status === "pending-review" ? "&start=warm_up" : "";
    return `/lessons/${slug}?token=${encodeURIComponent(token)}${startParam}`;
  };

  return (
    <main className="min-h-screen bg-[#0c1017] text-[#e8e7e4] font-sans">
      <div className="mx-auto max-w-6xl px-6 py-10 md:py-14">
        <header className="border-b border-[#202631] pb-8">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-400">
            Fluentia Study Room
          </p>
          <div className="mt-3 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <h1 className="font-[var(--font-fraunces)] text-3xl font-semibold text-[#f1eee8]">
                Welcome back, {displayName}.
              </h1>
              <p className="mt-2 text-sm text-[#8f98a8]">Choose a lesson to continue your journey.</p>
            </div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setDictionaryOpen(true)} aria-label="Open dictionary" className="flex h-9 w-9 items-center justify-center rounded-md border border-[#394252] bg-[#171d28] text-stone-400 transition hover:border-amber-500 hover:text-amber-300"><BookOpen className="h-4 w-4" /></button>
              <button type="button" onClick={() => setSidebarOpen((open) => !open)} aria-expanded={sidebarOpen} aria-controls="learning-sidebar" className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs transition ${sidebarOpen ? "border-amber-500/70 bg-amber-500/10 text-amber-300" : "border-[#394252] bg-[#171d28] text-stone-300 hover:border-amber-500"}`}><PanelRight className="h-4 w-4" />Learning Hub</button>
              <div className="flex items-center gap-2 border-l border-[#29303c] pl-3" aria-label="Student profile">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-slate-950">{profileInitials}</div>
                <div className="hidden text-left sm:block"><p className="text-xs font-semibold text-stone-100">{displayName}</p><p className="text-[10px] text-stone-500">{activeStudent.profile?.level || "B2 Upper Intermediate"}</p></div>
                <button type="button" aria-label="Profile settings" title="Profile settings" className="text-stone-500 transition hover:text-amber-300"><Settings2 className="h-4 w-4" /></button>
              </div>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs text-[#667084]"><UserRound className="h-3.5 w-3.5" />{lessons.length} lessons available <span className="text-[#394252]">|</span> B2 Upper Intermediate</div>
        </header>

        <section className="grid gap-3 border-b border-[#202631] py-6 sm:grid-cols-3" aria-label="Student progress overview">
          <div className="rounded-xl border border-[#202631] bg-[#121721] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#667084]">Lessons Completed</p>
            <p className="mt-2 text-xl font-semibold text-stone-100">{completedLessons} <span className="text-sm font-normal text-stone-500">/ {lessons.length}</span></p>
          </div>
          <div className="rounded-xl border border-[#202631] bg-[#121721] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#667084]">Overall Evaluation Status</p>
            <p className={`mt-2 flex items-center gap-2 text-sm font-semibold ${hasFeedback ? "text-emerald-300" : "text-amber-400"}`}>
              {hasFeedback ? <CheckCircle2 className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}
              {hasFeedback ? "Feedback Ready" : hasPendingReview ? "Pending Review" : "Pending Review"}
            </p>
          </div>
          <div className="rounded-xl border border-[#202631] bg-[#121721] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#667084]">Attendance / Level</p>
            <p className="mt-2 text-sm font-semibold text-stone-100">{activeStudent.profile?.attendanceRate || 0}% <span className="font-normal text-stone-500">|</span> {activeStudent.profile?.level}</p>
          </div>
        </section>

        <section className="mt-6 rounded-xl border border-amber-500/20 bg-[#121721] p-5" aria-label="Instructor note">
          <div className="flex items-start gap-3">
            <MessageSquareText className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">A note from your instructor</p>
              <p className="mt-2 text-sm leading-relaxed text-stone-300">{instructorNote}</p>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-xl border border-[#202631] bg-[#121721] p-5" aria-label="My Vocabulary and Flashcards">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-amber-400"><Layers3 className="h-4 w-4" /><p className="text-[10px] font-semibold uppercase tracking-[0.14em]">My Vocabulary &amp; Flashcards</p></div>
              <p className="mt-2 text-sm text-stone-400">Review saved words between lessons.</p>
            </div>
            <Link href={getLessonHref(lessons[0]?.slug || "habits-01", getLessonStatus(lessonStates[lessons[0]?.slug]))} className="text-xs font-semibold text-amber-300 hover:text-amber-200">Open Study Room</Link>
          </div>
          {currentCard ? <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center"><button type="button" onClick={() => setShowDefinition((shown) => !shown)} className="flex min-h-24 flex-1 items-center justify-center rounded-lg border border-amber-500/30 bg-[#0c1017] p-4 text-center transition hover:border-amber-400"><span className="font-[var(--font-fraunces)] text-2xl text-stone-100">{showDefinition ? currentCard.definition : currentCard.word}</span></button><div className="flex items-center justify-between gap-4 sm:w-36 sm:flex-col"><span className="text-xs text-stone-500">{cardIndex + 1} / {savedWords.length} cards</span><button type="button" onClick={() => { setCardIndex((index) => (index + 1) % savedWords.length); setShowDefinition(false); }} className="text-xs font-semibold text-amber-300 hover:text-amber-200">Next card</button></div></div> : <p className="mt-4 rounded-lg border border-dashed border-[#394252] p-4 text-sm text-stone-500">Save words in the Study Room dictionary to build your first deck.</p>}
        </section>

        {latestReport?.published && (
          <section className="mt-6 rounded-xl border border-[#202631] bg-[#121721] p-5" aria-label="Latest analytical report">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Latest Analytical Report</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div><p className="text-xs font-semibold text-stone-300">Strengths</p><p className="mt-1 whitespace-pre-wrap text-sm text-stone-400">{latestReport.strengths || "No strengths recorded yet."}</p></div>
              <div><p className="text-xs font-semibold text-stone-300">Areas to Improve</p><p className="mt-1 whitespace-pre-wrap text-sm text-stone-400">{latestReport.areasToImprove || "No improvement areas recorded yet."}</p></div>
              <div><p className="text-xs font-semibold text-stone-300">Study Hub Prescription</p><p className="mt-1 whitespace-pre-wrap text-sm text-amber-300">{latestReport.studyHubPrescription || "No prescription recorded yet."}</p></div>
              <div><p className="text-xs font-semibold text-stone-300">Voice Feedback</p>{latestReport.voiceFeedbackUrl ? <a href={latestReport.voiceFeedbackUrl} className="mt-1 block truncate text-sm text-amber-300 hover:text-amber-200">{latestReport.voiceFeedbackUrl}</a> : <p className="mt-1 text-sm text-stone-400">No voice feedback attached.</p>}</div>
            </div>
          </section>
        )}

        <section className="grid gap-5 pt-8 md:grid-cols-2" aria-label="Available lessons">
          {lessons.map((lesson) => {
            const status = getLessonStatus(lessonStates[lesson.slug]);
            const statusCopy = status === "completed"
              ? "COMPLETED"
              : status === "pending-review"
              ? "PENDING REVIEW"
              : status === "in-progress"
              ? "IN PROGRESS"
              : "NOT STARTED";
            const ctaCopy = status === "completed"
              ? "View Results & Feedback"
              : status === "pending-review"
              ? "Submitted - Pending Review"
              : status === "in-progress"
              ? "Continue Lesson"
              : "Start Lesson";
            return (
            <article
              key={lesson.slug}
              className="group overflow-hidden rounded-xl border border-[#202631] bg-[#121721] transition-colors hover:border-amber-500/50"
            >
              <div className="relative h-44 overflow-hidden border-b border-[#202631]">
                <img src={lesson.coverImage} alt="" className="h-full w-full object-cover opacity-70 transition duration-500 group-hover:scale-105 group-hover:opacity-85" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#121721] via-transparent to-transparent" />
                <span className="absolute bottom-4 left-5 rounded-sm border border-[#a77b25] bg-[#332713]/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#dca42f]">
                  Module {lesson.moduleNumber}
                </span>
              </div>
              <div className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-2 text-amber-400">
                    <BookOpen className="h-4 w-4" />
                    <span className="text-[10px] font-semibold uppercase tracking-[0.14em]">Lesson</span>
                  </div>
                  <span className={`rounded-sm border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] ${
                    status === "completed"
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                      : status === "pending-review"
                      ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                      : status === "in-progress"
                      ? "border-sky-500/30 bg-sky-500/10 text-sky-300"
                      : "border-[#394252] bg-[#171d28] text-stone-400"
                  }`}>
                    {statusCopy}
                  </span>
                </div>
                <div>
                  <h2 className="mt-2 font-[var(--font-fraunces)] text-xl font-semibold text-stone-100">{lesson.title}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-stone-400">{lesson.subtitle}</p>
                  <p className="mt-3 flex items-center gap-2 text-[11px] text-stone-500"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#283344] text-[8px] font-semibold text-[#d9a63b]">{lesson.instructor?.initials || "AV"}</span> Guided by {lesson.instructor?.fullName || "AVoss"}</p>
                </div>
                <Link href={getLessonHref(lesson.slug, status)} className={`mt-5 inline-flex rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
                  status === "completed"
                    ? "bg-emerald-500 text-[#0c1017]"
                    : "bg-amber-500 text-[#0c1017] group-hover:bg-amber-400"
                }`}>
                  {ctaCopy}
                </Link>
                {status === "completed" && lessonStates[lesson.slug]?.evaluation?.published && (
                  <details className="mt-5 border-t border-[#202631] pt-4">
                    <summary className="cursor-pointer text-xs font-semibold text-amber-300 hover:text-amber-200">View analytical report</summary>
                    <div className="mt-4 grid gap-3 text-sm text-stone-400 sm:grid-cols-2">
                      <div><p className="text-xs font-semibold text-stone-300">Rubrics</p><p className="mt-1 text-amber-300">{Object.entries(lessonStates[lesson.slug]?.evaluation?.scores || {}).map(([criterion, score]) => `${criterion}: ${score}`).join(" | ") || "No rubric scores recorded."}</p></div>
                      <div><p className="text-xs font-semibold text-stone-300">Strengths</p><p className="mt-1 whitespace-pre-wrap">{lessonStates[lesson.slug]?.evaluation?.strengths || "No strengths recorded."}</p></div>
                      <div><p className="text-xs font-semibold text-stone-300">Areas to Improve</p><p className="mt-1 whitespace-pre-wrap">{lessonStates[lesson.slug]?.evaluation?.areasToImprove || "No improvement areas recorded."}</p></div>
                      <div><p className="text-xs font-semibold text-stone-300">Feedback</p><p className="mt-1 whitespace-pre-wrap">{lessonStates[lesson.slug]?.evaluation?.comments || "No comments recorded."}</p></div>
                    </div>
                  </details>
                )}
              </div>
            </article>
            );
          })}
        </section>
      </div>
      <LearningSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        words={savedWords}
        notes={notes}
        resource={latestReport?.studyHubPrescription}
        onSaveNote={(note) => {
          setNotes([note, ...notes.filter((item) => item.id !== note.id)]);
          void saveStudentNote(token, note);
        }}
        onRemoveWord={(word) => {
          setSavedWords(savedWords.filter((item) => item.word.toLowerCase() !== word.toLowerCase()));
          void removeVocabularyWord(token, word);
        }}
      />
      <ChatWidget
        messages={chatMessages}
        onSend={(message) => {
          setChatMessages([...chatMessages, message]);
          void saveChatMessage(token, message);
        }}
      />
      {dictionaryOpen && (
        <DictionaryModal
          savedWords={savedWords}
          onClose={() => setDictionaryOpen(false)}
          onSave={(word) => {
            setSavedWords([word, ...savedWords.filter((item) => item.word.toLowerCase() !== word.word.toLowerCase())]);
            void saveVocabularyWord(token, word);
          }}
        />
      )}
    </main>
  );
}