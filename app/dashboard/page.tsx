"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BookOpen, CheckCircle2, Clock3, Flame, Layers3, MessageSquareText, PanelRight, Settings2, UserRound, X } from "lucide-react";
import { DEFAULT_STUDENT, STUDENT_USERS, type StudentUser } from "@/lib/users";
import { persistResolvedStudent, PublishedLessonState, readLastAccessedLesson, resolveStudentAccess, STANDARD_LESSONS, writeLastAccessedLesson } from "@/lib/lesson-store";
import { FLUENTIA_DATA_UPDATED_EVENT, fetchChatMessages, fetchLessonState, fetchLessons, fetchSavedVocabulary, fetchStudentNotes, removeVocabularyWord, saveChatMessage, saveStudentNote, saveVocabularyWord } from "@/services/storage-service";
import { ChatMessage, SavedVocabularyWord, StudentNote } from "@/types/lesson";
import { DictionaryModal } from "@/components/study-room/dictionary-modal";
import { LearningSidebar } from "@/components/study-room/learning-sidebar";
import { ChatWidget } from "@/components/study-room/chat-widget";
import { AccessCard } from "@/components/access/access-card";

type LessonStatus = "not-started" | "in-progress" | "pending-review" | "completed";

const AVATAR_PRESETS = [
  { id: "amber", label: "Amber Gold", backgroundColor: "#f59e0b", className: "text-slate-950" },
  { id: "indigo", label: "Midnight Indigo", backgroundColor: "#4f46e5", className: "text-white" },
  { id: "emerald", label: "Emerald Slate", backgroundColor: "#10b981", className: "text-slate-950" },
] as const;

const BANNER_PRESETS = [
  { id: "default-dark", label: "Default Dark", image: "https://images.unsplash.com/photo-1519608487953-e999c86e7455?w=1600&q=85" },
  { id: "mountains", label: "Mountains", image: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1600&q=85" },
  { id: "architecture", label: "Abstract Architecture", image: "https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=1600&q=85" },
] as const;

type ProfilePreferences = {
  level?: string;
  targetGoal?: string;
  avatarPreset?: (typeof AVATAR_PRESETS)[number]["id"];
  customAvatarUrl?: string;
  bannerPreset?: (typeof BANNER_PRESETS)[number]["id"];
  customBannerUrl?: string;
};

function getLessonStatus(state?: PublishedLessonState | null): LessonStatus {
  if (!state || state.status === "draft") return "not-started";
  if (state.submission?.status === "reviewed" || state.evaluation.published) return "completed";
  if (state.submission?.status === "submitted") return "pending-review";
  if (state.submission?.status === "in_progress") return "in-progress";
  return "not-started";
}

function isValidImageUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export default function DashboardPage() {
  const [isMounted, setIsMounted] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
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
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileTab, setProfileTab] = useState<"profile" | "customization">("profile");
  const [profileLevel, setProfileLevel] = useState(DEFAULT_STUDENT.profile?.level || "B2 Upper Intermediate");
  const [profileGoal, setProfileGoal] = useState(DEFAULT_STUDENT.profile?.targetGoal || "Fluency");
  const [avatarPreset, setAvatarPreset] = useState<ProfilePreferences["avatarPreset"]>("amber");
  const [customAvatarUrl, setCustomAvatarUrl] = useState("");
  const [bannerPreset, setBannerPreset] = useState<ProfilePreferences["bannerPreset"]>("default-dark");
  const [customBannerUrl, setCustomBannerUrl] = useState("");

  useEffect(() => {
    const loadDashboard = async (studentToken: string) => {
      const availableLessons = (await fetchLessons()).filter((lesson) => lesson.status !== "draft");
      setLessons(availableLessons);
      const nextLessonStates = Object.fromEntries(await Promise.all(availableLessons.map(async (lesson) => [lesson.slug, await fetchLessonState(lesson.slug, studentToken)])));
      setLessonStates(nextLessonStates);
      const completedModulesCount = availableLessons.filter((lesson) => getLessonStatus(nextLessonStates[lesson.slug]) === "completed").length;
      setActiveStudent((previous) => ({
        ...previous,
        profile: previous.profile ? { ...previous.profile, completedModulesCount } : previous.profile,
      }));
      setSavedWords(await fetchSavedVocabulary(studentToken));
      const [studentNotes, messages] = await Promise.all([fetchStudentNotes(studentToken), fetchChatMessages(studentToken)]);
      setNotes(studentNotes);
      setChatMessages(messages);
    };
    const params = new URLSearchParams(window.location.search);
    const active = resolveStudentAccess(params.get("student") || params.get("token"));
    if (!active) {
      setAccessDenied(true);
      setIsMounted(true);
      return;
    }
    persistResolvedStudent(active);
    const studentToken = active.token;
    const storedProfile = window.localStorage.getItem(`fluentia:profile:${studentToken}`);
    let profileOverrides: Partial<NonNullable<StudentUser["profile"]>> = {};
    let preferences: ProfilePreferences = {};
    try {
      preferences = storedProfile ? JSON.parse(storedProfile) as ProfilePreferences : {};
      profileOverrides = preferences;
    } catch {
      window.localStorage.removeItem(`fluentia:profile:${studentToken}`);
    }
    const activeWithProfile = { ...active, profile: active.profile ? { ...active.profile, ...profileOverrides } : active.profile };

    setActiveStudent(activeWithProfile);
    setProfileLevel(activeWithProfile.profile?.level || "B2 Upper Intermediate");
    setProfileGoal(activeWithProfile.profile?.targetGoal || "Fluency");
    setAvatarPreset(preferences.avatarPreset || "amber");
    setCustomAvatarUrl(preferences.customAvatarUrl || "");
    setBannerPreset(preferences.bannerPreset || "default-dark");
    setCustomBannerUrl(preferences.customBannerUrl || "");
    setIsMounted(true);
    const refreshLessons = () => void loadDashboard(studentToken);
    void loadDashboard(studentToken);
    window.addEventListener("storage", refreshLessons);
    window.addEventListener(FLUENTIA_DATA_UPDATED_EVENT, refreshLessons);
    window.addEventListener("fluentia:lesson-updated", refreshLessons);
    return () => {
      window.removeEventListener("storage", refreshLessons);
      window.removeEventListener(FLUENTIA_DATA_UPDATED_EVENT, refreshLessons);
      window.removeEventListener("fluentia:lesson-updated", refreshLessons);
    };
  }, []);

  if (!isMounted) {
    return <main className="min-h-screen bg-[#0c1017] text-[#e8e7e4]" />;
  }

  if (accessDenied) {
    return <AccessCard title="By Invitation Only" message="Access to Fluentia is reserved for private sessions. Please contact your instructor to receive a valid student session token." />;
  }

  const token = activeStudent.token || activeStudent.id;
  const displayLessons = lessons.length > 0 ? lessons : STANDARD_LESSONS;
  const completedLessons = displayLessons.filter(
    (lesson) => getLessonStatus(lessonStates[lesson.slug]) === "completed"
  ).length;
  const hasPendingReview = displayLessons.some(
    (lesson) => getLessonStatus(lessonStates[lesson.slug]) === "pending-review"
  );
  const hasFeedback = completedLessons > 0;
  const instructorNote =
    lessonStates[displayLessons[0]?.slug]?.studentProfile.teacherNotes ||
    activeStudent.profile?.teacherNotes ||
    "Your instructor will add personalized guidance here.";
  const latestReport = lessonStates[displayLessons[0]?.slug]?.evaluation;
  const currentCard = savedWords[cardIndex % Math.max(savedWords.length, 1)];
  const inProgressLessons = displayLessons.filter((lesson) => getLessonStatus(lessonStates[lesson.slug]) === "in-progress").length;
  const progressPercent = displayLessons.length ? Math.round((completedLessons / displayLessons.length) * 100) : 0;
  const lastAccessedSlug = typeof window !== "undefined" ? readLastAccessedLesson(token) : null;
  const lastAccessedLesson = displayLessons.find((lesson) => lesson.slug === lastAccessedSlug && getLessonStatus(lessonStates[lesson.slug]) !== "completed");
  const activeLesson = displayLessons.find((lesson) => getLessonStatus(lessonStates[lesson.slug]) === "in-progress") || lastAccessedLesson;
  const nextLesson = activeLesson || displayLessons.find((lesson) => getLessonStatus(lessonStates[lesson.slug]) !== "completed") || displayLessons[0];
  const displayName = activeStudent.name === "Arash Test" ? "Arash Vossoughi" : activeStudent.name;
  const profileInitials = displayName.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  const selectedAvatar = AVATAR_PRESETS.find((preset) => preset.id === avatarPreset) || AVATAR_PRESETS[0];
  const selectedBanner = BANNER_PRESETS.find((preset) => preset.id === bannerPreset) || BANNER_PRESETS[0];
  const avatarImage = isValidImageUrl(customAvatarUrl.trim()) ? customAvatarUrl.trim() : "";
  const bannerImage = isValidImageUrl(customBannerUrl.trim())
    ? customBannerUrl.trim()
    : nextLesson?.coverImage || selectedBanner.image;
  const availableLessons = displayLessons.filter((lesson) => lesson.slug !== nextLesson?.slug);
  const getLessonHref = (slug: string, status: LessonStatus) => {
    const stepParam = status === "completed" ? "&step=7" : status === "pending-review" ? "&start=warm_up" : "";
    return `/lessons/${slug}?student=${encodeURIComponent(token)}${stepParam}`;
  };
  const rememberLesson = (slug: string) => writeLastAccessedLesson(slug, token);

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
              <div className="relative flex items-center gap-2 border-l border-[#29303c] pl-3" aria-label="Student profile">
                <button type="button" onClick={() => setProfileOpen((open) => !open)} aria-expanded={profileOpen} aria-controls="student-profile-flyout" style={!avatarImage ? { backgroundColor: selectedAvatar.backgroundColor } : undefined} className={`flex h-9 w-9 items-center justify-center overflow-hidden rounded-full text-xs font-bold transition hover:ring-2 hover:ring-amber-400/60 ${avatarImage ? "bg-[#283344]" : selectedAvatar.className}`}>
                  {avatarImage ? <img src={avatarImage} alt={`${displayName} avatar`} className="h-full w-full object-cover" /> : profileInitials}
                </button>
                <div className="hidden text-left sm:block"><p className="text-xs font-semibold text-stone-100">{displayName}</p><p className="text-[10px] text-stone-500">{activeStudent.profile?.level || "B2 Upper Intermediate"}</p></div>
                <button type="button" onClick={() => { setProfileOpen(true); setProfileTab("profile"); }} aria-label="Profile settings" title="Profile settings" className="text-stone-500 transition hover:text-amber-300"><Settings2 className="h-4 w-4" /></button>
                {profileOpen && (
                  <div id="student-profile-flyout" className="absolute right-0 top-12 z-30 flex max-h-[min(80vh,620px)] w-[min(22rem,calc(100vw-3rem))] flex-col overflow-hidden rounded-xl border border-[#394252] bg-[#171d28] text-left shadow-2xl">
                    <div className="flex items-start justify-between gap-4 border-b border-[#29303c] p-4"><div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Student profile</p><p className="mt-1 text-sm font-semibold text-stone-100">{displayName}</p></div><button type="button" onClick={() => setProfileOpen(false)} aria-label="Close profile" className="text-stone-500 hover:text-stone-200"><X className="h-4 w-4" /></button></div>
                    <div className="grid grid-cols-2 border-b border-[#29303c] px-4 pt-3"><button type="button" onClick={() => setProfileTab("profile")} className={`border-b-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.12em] ${profileTab === "profile" ? "border-amber-500 text-amber-300" : "border-transparent text-stone-500 hover:text-stone-300"}`}>Profile &amp; Preferences</button><button type="button" onClick={() => setProfileTab("customization")} className={`border-b-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.12em] ${profileTab === "customization" ? "border-amber-500 text-amber-300" : "border-transparent text-stone-500 hover:text-stone-300"}`}>Customization</button></div>
                    <div className="min-h-0 flex-1 overflow-y-auto p-4">
                      {profileTab === "profile" ? <div className="space-y-4 text-xs"><div className="grid grid-cols-2 gap-3"><div><p className="text-stone-500">Name</p><p className="mt-1 text-stone-200">{displayName}</p></div><div><p className="text-stone-500">Progress</p><p className="mt-1 text-stone-200">{completedLessons} / {displayLessons.length} lessons</p></div></div><label className="block text-stone-400">Level<select value={profileLevel} onChange={(event) => setProfileLevel(event.target.value)} className="mt-1 w-full rounded-md border border-[#394252] bg-[#0c1017] p-2 text-xs text-stone-200"><option>B1 Intermediate</option><option>B2 Upper Intermediate</option><option>C1 Advanced</option></select></label><label className="block text-stone-400">Learning goal<input value={profileGoal} onChange={(event) => setProfileGoal(event.target.value)} className="mt-1 w-full rounded-md border border-[#394252] bg-[#0c1017] p-2 text-xs text-stone-200" /></label><label className="block border-t border-[#29303c] pt-3 text-stone-400">Switch Student<select value={token} onChange={(event) => { window.location.href = `/dashboard?token=${encodeURIComponent(event.target.value)}`; }} className="mt-1 w-full rounded-md border border-[#394252] bg-[#0c1017] p-2 text-xs text-stone-200">{STUDENT_USERS.map((student) => <option key={student.token} value={student.token}>{student.name}</option>)}</select></label></div> : <div className="space-y-4"><div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Student Avatar</p><div className="mt-2 grid grid-cols-3 gap-2">{AVATAR_PRESETS.map((preset) => <button key={preset.id} type="button" onClick={() => { setAvatarPreset(preset.id); setCustomAvatarUrl(""); }} aria-label={`Use ${preset.label} avatar`} className={`flex flex-col items-center gap-1 rounded-md border p-2 text-[10px] text-stone-400 transition ${avatarPreset === preset.id && !avatarImage ? "border-amber-500 bg-amber-500/10 text-amber-300" : "border-[#394252] hover:border-amber-500/50"}`}><span style={{ backgroundColor: preset.backgroundColor }} className={`flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-bold ${preset.className}`}>{profileInitials}</span>{preset.label}</button>)}</div><div className="mt-3 flex items-center gap-2 rounded-md border border-[#29303c] bg-[#0c1017] p-2"><span style={!avatarImage ? { backgroundColor: selectedAvatar.backgroundColor } : undefined} className={`flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-[10px] font-bold ${avatarImage ? "bg-[#283344]" : selectedAvatar.className}`}>{avatarImage ? <img src={avatarImage} alt="Custom avatar preview" className="h-full w-full object-cover" /> : profileInitials}</span><span className="text-xs text-stone-400">Live avatar preview</span></div><label className="mt-2 block text-xs text-stone-400">Custom Avatar URL<input value={customAvatarUrl} onChange={(event) => setCustomAvatarUrl(event.target.value)} placeholder="https://..." className="mt-1 w-full rounded-md border border-[#394252] bg-[#0c1017] p-2 text-xs text-stone-200" /></label></div><div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Dashboard Hero Banner</p><div className="mt-2 grid grid-cols-3 gap-2">{BANNER_PRESETS.map((preset) => <button key={preset.id} type="button" onClick={() => { setBannerPreset(preset.id); setCustomBannerUrl(""); }} className={`overflow-hidden rounded-md border text-left transition ${bannerPreset === preset.id && !customBannerUrl ? "border-amber-500" : "border-[#394252] hover:border-amber-500/50"}`}><img src={preset.image} alt="" className="h-10 w-full object-cover opacity-75" /><span className="block truncate px-1.5 py-1 text-[9px] text-stone-400">{preset.label}</span></button>)}</div><label className="mt-2 block text-xs text-stone-400">Custom Banner URL<input value={customBannerUrl} onChange={(event) => setCustomBannerUrl(event.target.value)} placeholder="https://..." className="mt-1 w-full rounded-md border border-[#394252] bg-[#0c1017] p-2 text-xs text-stone-200" /></label></div></div>}
                    </div>
                    <div className="border-t border-[#29303c] bg-[#171d28] p-4"><button type="button" onClick={() => { const profile = { ...activeStudent.profile, level: profileLevel, targetGoal: profileGoal }; setActiveStudent({ ...activeStudent, profile }); window.localStorage.setItem(`fluentia:profile:${token}`, JSON.stringify({ level: profileLevel, targetGoal: profileGoal, avatarPreset, customAvatarUrl, bannerPreset, customBannerUrl })); setProfileOpen(false); }} className="w-full rounded-md bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400">Save settings</button></div>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs text-[#667084]"><UserRound className="h-3.5 w-3.5" />{displayLessons.length} lessons available <span className="text-[#394252]">|</span> B2 Upper Intermediate</div>
        </header>

        <section className="grid gap-3 border-b border-[#202631] py-6 sm:grid-cols-3" aria-label="Student progress overview">
          <div className="rounded-xl border border-[#202631] bg-[#121721] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#667084]">Lessons Completed</p>
            <p className="mt-2 text-xl font-semibold text-stone-100">{completedLessons} <span className="text-sm font-normal text-stone-500">/ {displayLessons.length}</span></p>
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
            <Link href={getLessonHref(displayLessons[0]?.slug || "habits-01", getLessonStatus(lessonStates[displayLessons[0]?.slug]))} onClick={() => rememberLesson(displayLessons[0]?.slug || "habits-01")} className="text-xs font-semibold text-amber-300 hover:text-amber-200">Open Study Room</Link>
          </div>
          {currentCard ? <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center"><button type="button" onClick={() => setShowDefinition((shown) => !shown)} className="flex min-h-24 flex-1 items-center justify-center rounded-lg border border-amber-500/30 bg-[#0c1017] p-4 text-center transition hover:border-amber-400"><span className="font-[var(--font-fraunces)] text-2xl text-stone-100">{showDefinition ? currentCard.definition : currentCard.word}</span></button><div className="flex items-center justify-between gap-4 sm:w-36 sm:flex-col"><span className="text-xs text-stone-500">{cardIndex + 1} / {savedWords.length} cards</span><button type="button" onClick={() => { setCardIndex((index) => (index + 1) % savedWords.length); setShowDefinition(false); }} className="text-xs font-semibold text-amber-300 hover:text-amber-200">Next card</button></div></div> : <p className="mt-4 rounded-lg border border-dashed border-[#394252] p-4 text-sm text-stone-500">Save words in the Study Room dictionary to build your first deck.</p>}
        </section>

        {nextLesson && <section className="mt-6" aria-label="Continue learning">
          <Link href={getLessonHref(nextLesson.slug, getLessonStatus(lessonStates[nextLesson.slug]))} onClick={() => rememberLesson(nextLesson.slug)} className="group relative block h-64 overflow-hidden rounded-xl border border-amber-500/30 bg-[#171d28] transition-colors hover:border-amber-400/70">
            <img src={bannerImage} alt="" className="absolute inset-0 h-full w-full object-cover opacity-55 transition duration-700 group-hover:scale-105 group-hover:opacity-65" />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(7,11,17,.95),rgba(7,11,17,.6)_52%,rgba(7,11,17,.82)),linear-gradient(0deg,rgba(7,11,17,.92),transparent_65%)]" />
            <div className="relative flex h-full flex-col justify-between p-5 md:p-7"><div><div className="flex items-center gap-2 text-amber-400"><Flame className="h-4 w-4" /><span className="text-[10px] font-semibold uppercase tracking-[0.16em]">Continue Learning / Next Up</span></div><h2 className="mt-2 font-[var(--font-fraunces)] text-2xl font-semibold text-stone-100 md:text-3xl">{nextLesson.title}</h2><p className="mt-2 max-w-2xl text-sm text-stone-300">{nextLesson.subtitle}</p></div><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div className="w-full max-w-xs"><div className="flex items-center justify-between text-xs text-stone-300"><span>{progressPercent}% course progress</span><span>{completedLessons}/{displayLessons.length}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-[#0c1017]/80"><div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${progressPercent}%` }} /></div></div><span className="inline-flex w-fit items-center rounded-md bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 transition group-hover:bg-amber-400">Start Lesson <span className="ml-2" aria-hidden="true">-&gt;</span></span></div></div>
          </Link>
        </section>}

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
          {availableLessons.map((lesson) => {
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