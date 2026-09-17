"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, CheckCircle2, Clock3, Flame, Layers3, MessageSquareText, PanelRight, Settings2, UserRound, X } from "lucide-react";
import { type StudentUser } from "@/lib/users";
import { PublishedLessonState, writeLastAccessedLesson } from "@/lib/lesson-store";
import { getLessonsByStudentId, type LessonWithVersion } from "@/lib/lessons";
import { FLUENTIA_DATA_UPDATED_EVENT, fetchLessonState, fetchSavedVocabulary, fetchStudentNotes, removeVocabularyWord, saveChatMessage, saveStudentNote, saveVocabularyWord } from "@/services/storage-service";
import { ChatMessage, SavedVocabularyWord, StudentNote } from "@/types/lesson";
import { DictionaryModal } from "@/components/study-room/dictionary-modal";
import { LearningSidebar } from "@/components/study-room/learning-sidebar";
import { ChatWidget } from "@/components/study-room/chat-widget";
import { AccessCard } from "@/components/access/access-card";
import { saveStudentProfile } from "@/lib/student-profiles";
import { createBrowserClient } from "@supabase/ssr";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { flowType: "pkce" } },
);

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

type DashboardError = {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
};

function logDashboardError(context: string, error: unknown) {
  if (error instanceof Error) {
    console.error(context, {
      name: error.name,
      message: error.message,
      details: (error as Error & { details?: string }).details,
      hint: (error as Error & { hint?: string }).hint,
      stack: error.stack,
    });
    return;
  }
  const details = error && typeof error === "object" ? error as DashboardError : undefined;
  console.error(context, {
    code: details?.code,
    message: details?.message || String(error),
    details: details?.details,
    hint: details?.hint,
  });
}

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

function DashboardContent() {
  const router = useRouter();
  const [isMounted, setIsMounted] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [activeStudent, setActiveStudent] = useState<StudentUser | null>(null);
  const [lessons, setLessons] = useState<LessonWithVersion[]>([]);
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
  const [avatarPreset, setAvatarPreset] = useState<ProfilePreferences["avatarPreset"]>("amber");
  const [customAvatarUrl, setCustomAvatarUrl] = useState("");
  const [bannerPreset, setBannerPreset] = useState<ProfilePreferences["bannerPreset"]>("default-dark");
  const [customBannerUrl, setCustomBannerUrl] = useState("");
  const [bannerLoadFailed, setBannerLoadFailed] = useState(false);

  useEffect(() => {
    const loadDashboard = async (userId: string) => {
      const [lessonResult, vocabularyResult, notesResult] = await Promise.allSettled([
        getLessonsByStudentId(userId),
        fetchSavedVocabulary(userId),
        fetchStudentNotes(userId),
      ]);
      if (lessonResult.status === "rejected") logDashboardError("Dashboard lesson loading failed:", lessonResult.reason);
      if (vocabularyResult.status === "rejected") logDashboardError("Dashboard vocabulary loading failed:", vocabularyResult.reason);
      if (notesResult.status === "rejected") logDashboardError("Dashboard notes loading failed:", notesResult.reason);

      const lessonRows = lessonResult.status === "fulfilled" ? lessonResult.value : [];
      const savedWords = vocabularyResult.status === "fulfilled" ? vocabularyResult.value : [];
      const studentNotes = notesResult.status === "fulfilled" ? notesResult.value : [];
      const availableLessons = lessonRows;
      setLessons(availableLessons);
      const lessonStateResults = await Promise.allSettled(
        availableLessons.map(async (lesson) => [lesson.id, await fetchLessonState(lesson.id, userId)] as const),
      );
      lessonStateResults.forEach((result) => {
        if (result.status === "rejected") logDashboardError("Dashboard lesson-state loading failed:", result.reason);
      });
      const nextLessonStates = Object.fromEntries(
        lessonStateResults
          .filter((result): result is PromiseFulfilledResult<readonly [string, PublishedLessonState | null]> => result.status === "fulfilled")
          .map((result) => result.value),
      );
      setLessonStates(nextLessonStates);
      const completedModulesCount = availableLessons.filter((lesson) => getLessonStatus(nextLessonStates[lesson.id]) === "completed").length;
      setActiveStudent((previous) => previous
        ? { ...previous, role: "student", profile: { ...previous.profile, completedModulesCount } }
        : previous);
      setSavedWords(savedWords);
      setNotes(studentNotes);
    };
    const loadAuthenticatedDashboard = async () => {
      try {
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user) {
          logDashboardError("Dashboard client session lookup failed after server authentication:", userError || new Error("No authenticated user was returned"));
          setAccessDenied(true);
          setIsMounted(true);
          return;
        }

        const { data: roleProfile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", userData.user.id)
          .maybeSingle();
        const instructorProfile = roleProfile ? null : (await supabase
          .from("instructors")
          .select("id")
          .eq("id", userData.user.id)
          .maybeSingle()).data;
        if (roleProfile?.role === "instructor" || roleProfile?.role === "admin" || instructorProfile) {
          router.replace("/instructor");
          return;
        }
        if (roleProfile?.role && roleProfile.role !== "student") {
          setAccessDenied(true);
          setIsMounted(true);
          return;
        }

        const userEmail = userData.user.email?.trim().toLowerCase() || "";
        let student: { id: string; name: string; email: string; token: string } | null = null;
        try {
          const { data: studentRow, error: studentError } = await supabase
            .from("students")
            .select("id, name, email, token")
            .or(`id.eq.${userData.user.id},email.eq.${userEmail}`)
            .maybeSingle();

          if (studentError && studentError.code !== "PGRST116") {
            logDashboardError("Dashboard student lookup unavailable; using session metadata:", studentError);
          } else if (!studentError) {
            student = studentRow;
          }
        } catch (error) {
          logDashboardError("Dashboard student lookup threw an error; using session metadata:", error);
        }

        const resolvedStudentId = student?.id || userData.user.id;
        const fallbackName = userData.user.user_metadata?.name
          || userEmail
          || "Student";

      const active: StudentUser = {
        id: resolvedStudentId,
        token: student?.token || userData.user.id,
        name: student?.name || fallbackName,
        email: student?.email || userEmail || undefined,
        role: "student",
        profile: {
          id: resolvedStudentId,
          fullName: student?.name || fallbackName,
          level: "",
          targetGoal: "",
          avatarUrl: undefined,
          bannerUrl: undefined,
          weaknesses: [],
          teacherNotes: "",
          attendanceRate: 0,
          completedModulesCount: 0,
        },
      };

        setActiveStudent(active);
        const studentToken = resolvedStudentId;
        const storedProfile = window.localStorage.getItem(`fluentia:profile:${studentToken}`);
        let preferences: ProfilePreferences = {};
        try {
          preferences = storedProfile ? JSON.parse(storedProfile) as ProfilePreferences : {};
        } catch (error) {
          logDashboardError("Dashboard local profile preferences could not be parsed:", error);
          window.localStorage.removeItem(`fluentia:profile:${studentToken}`);
        }
        setAvatarPreset(preferences.avatarPreset || "amber");
        setCustomAvatarUrl(preferences.customAvatarUrl || active.profile.avatarUrl || "");
        setBannerPreset(preferences.bannerPreset || "default-dark");
        setCustomBannerUrl(preferences.customBannerUrl || active.profile.bannerUrl || "");
        setIsMounted(true);
        const refreshLessons = () => void loadDashboard(studentToken).catch((error) => logDashboardError("Dashboard refresh failed:", error));
        void loadDashboard(studentToken).catch((error) => logDashboardError("Dashboard initial data loading failed:", error));
        window.addEventListener("storage", refreshLessons);
        window.addEventListener(FLUENTIA_DATA_UPDATED_EVENT, refreshLessons);
        window.addEventListener("fluentia:lesson-updated", refreshLessons);
        return () => {
          window.removeEventListener("storage", refreshLessons);
          window.removeEventListener(FLUENTIA_DATA_UPDATED_EVENT, refreshLessons);
          window.removeEventListener("fluentia:lesson-updated", refreshLessons);
        };
      } catch (error) {
        logDashboardError("Dashboard authentication setup failed:", error);
        setAccessDenied(true);
        setIsMounted(true);
      }
    };

    let cleanup: (() => void) | undefined;
    void loadAuthenticatedDashboard().then((result) => { cleanup = result; });
    return () => {
      cleanup?.();
    };
  }, [router]);

  if (!isMounted) {
    return <main className="min-h-screen bg-[#0c1017] text-[#e8e7e4]" />;
  }

  if (accessDenied || !activeStudent) {
    return <AccessCard title="Student access required" message="Sign in with an authorized student account to open your dashboard." />;
  }

  const token = activeStudent.id;
  const displayLessons = lessons;
  const completedLessons = displayLessons.filter(
    (lesson) => getLessonStatus(lessonStates[lesson.id]) === "completed"
  ).length;
  const hasPendingReview = displayLessons.some(
    (lesson) => getLessonStatus(lessonStates[lesson.id]) === "pending-review"
  );
  const hasFeedback = completedLessons > 0;
  const instructorNote =
    lessonStates[displayLessons[0]?.id]?.studentProfile.teacherNotes ||
    activeStudent.profile?.teacherNotes ||
    "Your instructor will add personalized guidance here.";
  const latestReport = lessonStates[displayLessons[0]?.id]?.evaluation;
  const currentCard = savedWords[cardIndex % Math.max(savedWords.length, 1)];
  const inProgressLessons = displayLessons.filter((lesson) => getLessonStatus(lessonStates[lesson.id]) === "in-progress").length;
  const progressPercent = displayLessons.length ? Math.round((completedLessons / displayLessons.length) * 100) : 0;
  const nextLesson = displayLessons[0];
  const displayName = activeStudent.name;
  const profileInitials = displayName.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  const selectedAvatar = AVATAR_PRESETS.find((preset) => preset.id === avatarPreset) || AVATAR_PRESETS[0];
  const selectedBanner = BANNER_PRESETS.find((preset) => preset.id === bannerPreset) || BANNER_PRESETS[0];
  const activeBannerUrl = isValidImageUrl(customBannerUrl.trim()) ? customBannerUrl.trim() : selectedBanner.image;
  const dashboardHeaderBanner = bannerLoadFailed ? BANNER_PRESETS[0].image : activeBannerUrl;
  const lessonRecord = nextLesson as (LessonWithVersion & { cover_image?: string | null; banner_url?: string | null }) | undefined;
  const lessonContent = (nextLesson?.content || {}) as Record<string, unknown>;
  const activeModuleNumber = typeof lessonContent.moduleNumber === "number"
    ? lessonContent.moduleNumber
    : typeof nextLesson?.module_number === "number"
    ? nextLesson.module_number
    : null;
  const instructorLessonBanner = typeof lessonRecord?.cover_image === "string"
    ? lessonRecord.cover_image
    : typeof lessonRecord?.banner_url === "string"
    ? lessonRecord.banner_url
    : typeof nextLesson?.content?.coverImage === "string"
    ? nextLesson.content.coverImage
    : typeof nextLesson?.content?.bannerUrl === "string"
    ? nextLesson.content.bannerUrl
    : undefined;
  const avatarImage = isValidImageUrl(customAvatarUrl.trim()) ? customAvatarUrl.trim() : "";
  const availableLessons = displayLessons.filter((lesson) => lesson.id !== nextLesson?.id);
  const getLessonHref = (lesson: LessonWithVersion, status: LessonStatus) => {
    const stepParam = status === "completed" ? "&step=7" : status === "pending-review" ? "&start=warm_up" : "";
    const lessonPath = lesson.content?.slug || lesson.slug || lesson.id;
    return `/lessons/${lessonPath}?${stepParam.replace(/^&/, "")}`.replace(/\?$/, "");
  };
  const rememberLesson = (lessonId: string) => writeLastAccessedLesson(lessonId, token);

  return (
    <main className="min-h-screen bg-[#0c1017] text-[#e8e7e4] font-sans">
        <header style={{ backgroundImage: `linear-gradient(90deg, rgba(12,16,23,.96), rgba(12,16,23,.62)), url(${dashboardHeaderBanner})` }} className="relative flex min-h-[280px] w-full flex-col justify-end overflow-visible bg-slate-950 bg-cover bg-center p-8 md:min-h-[340px]">
          <img src={dashboardHeaderBanner} alt="" onError={() => setBannerLoadFailed(true)} className="absolute inset-0 h-full w-full object-cover opacity-0" aria-hidden="true" />
          <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=1800&q=80')] bg-cover bg-center opacity-40" aria-hidden="true" />
          <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(12,16,23,.98),transparent_65%)]" aria-hidden="true" />
          <div className="z-10 mx-auto w-full max-w-5xl">
          {profileOpen && <button type="button" aria-label="Close student profile" onClick={() => setProfileOpen(false)} className="fixed inset-0 z-0 cursor-default bg-black/55" />}
          <span className="w-fit rounded-full border border-amber-500/40 bg-[#332713]/85 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#e4ae45]">
            {nextLesson ? `ENGLISH - MODULE ${activeModuleNumber ?? 1}` : "ENGLISH - NO ACTIVE MODULE"}
          </span>
          <div className="mt-3 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <h1 className="font-[var(--font-fraunces)] text-3xl font-semibold text-[#f1eee8]">
                Welcome back, {displayName}.
              </h1>
              <p className="mt-2 text-sm text-[#b5bac2]">Seven stages. One connected journey.</p>
            </div>
            <div className="absolute top-6 right-8 z-10 flex items-center gap-2">
              <button type="button" onClick={() => setDictionaryOpen(true)} aria-label="Open dictionary" className={`group h-9 px-3 flex items-center gap-2 rounded-lg bg-slate-800/80 border text-xs font-medium transition-all cursor-pointer ${dictionaryOpen ? "border-amber-500/60 text-amber-400" : "border-slate-700/60 text-slate-300 hover:border-amber-500/60 hover:text-amber-400 hover:bg-slate-800"}`}><BookOpen className={`w-4 h-4 shrink-0 ${dictionaryOpen ? "text-amber-400" : "text-slate-400 group-hover:text-amber-400"}`} /></button>
              <button type="button" onClick={() => setSidebarOpen((open) => !open)} aria-expanded={sidebarOpen} aria-controls="learning-sidebar" className={`group h-9 px-3 flex items-center gap-2 rounded-lg bg-slate-800/80 border text-xs font-medium transition-all cursor-pointer ${sidebarOpen ? "border-amber-500/60 text-amber-400" : "border-slate-700/60 text-slate-300 hover:border-amber-500/60 hover:text-amber-400 hover:bg-slate-800"}`}><PanelRight className={`w-4 h-4 shrink-0 ${sidebarOpen ? "text-amber-400" : "text-slate-400 group-hover:text-amber-400"}`} />Learning Hub</button>
              <div className="hidden" aria-label="Student profile">
                <button type="button" onClick={() => setProfileOpen((open) => !open)} aria-expanded={profileOpen} aria-controls="student-profile-flyout" style={!avatarImage ? { backgroundColor: selectedAvatar.backgroundColor } : undefined} className={`flex h-8 w-8 items-center justify-center overflow-hidden rounded-full text-xs font-bold transition hover:ring-2 hover:ring-amber-400/60 ${avatarImage ? "bg-[#283344]" : selectedAvatar.className}`}>
                  {avatarImage ? <img src={avatarImage} alt={`${displayName} avatar`} className="h-full w-full object-cover" /> : profileInitials}
                </button>
                <div className="hidden text-left sm:block"><p className="text-xs font-semibold text-stone-100">{displayName}</p><p className="text-[10px] text-stone-500">{activeStudent.profile?.level || "B2 Upper Intermediate"}</p></div>
                <button type="button" onClick={() => { setProfileOpen(true); setProfileTab("profile"); }} aria-label="Profile settings" title="Profile settings" className="text-stone-500 transition hover:text-amber-300"><Settings2 className="h-4 w-4" /></button>
                {profileOpen && (
                  <div id="legacy-student-profile-flyout" className="absolute right-0 top-12 z-50 flex max-h-[min(80vh,620px)] w-[min(22rem,calc(100vw-3rem))] flex-col overflow-hidden rounded-xl border border-[#394252] bg-[#171d28] text-left shadow-2xl">
                    <div className="flex items-start justify-between gap-4 border-b border-[#29303c] p-4"><div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Student profile</p><p className="mt-1 text-sm font-semibold text-stone-100">{displayName}</p></div><button type="button" onClick={() => setProfileOpen(false)} aria-label="Close profile" className="text-stone-500 hover:text-stone-200"><X className="h-4 w-4" /></button></div>
                    <div className="grid grid-cols-2 border-b border-[#29303c] px-4 pt-3"><button type="button" onClick={() => setProfileTab("profile")} className={`border-b-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.12em] ${profileTab === "profile" ? "border-amber-500 text-amber-300" : "border-transparent text-stone-500 hover:text-stone-300"}`}>Profile &amp; Preferences</button><button type="button" onClick={() => setProfileTab("customization")} className={`border-b-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.12em] ${profileTab === "customization" ? "border-amber-500 text-amber-300" : "border-transparent text-stone-500 hover:text-stone-300"}`}>Customization</button></div>
                    <div className="min-h-0 flex-1 overflow-y-auto p-4">
                      {profileTab === "profile" ? <div className="space-y-4 text-xs"><div className="grid grid-cols-2 gap-3"><div><p className="text-stone-500">Name</p><p className="mt-1 text-stone-200">{displayName}</p></div><div><p className="text-stone-500">Progress</p><p className="mt-1 text-stone-200">{completedLessons} / {displayLessons.length} lessons</p></div></div><div className="grid grid-cols-2 gap-3"><div><p className="text-stone-500">Level</p><p className="mt-1 rounded-md border border-[#394252] bg-[#0c1017] p-2 text-stone-200">{activeStudent.profile?.level || "Not set"}</p></div><div><p className="text-stone-500">Learning goal</p><p className="mt-1 rounded-md border border-[#394252] bg-[#0c1017] p-2 text-stone-200">{activeStudent.profile?.targetGoal || "Not set"}</p></div></div><div className="border-t border-[#29303c] pt-3"><p className="text-stone-500">Assigned instructor</p><p className="mt-1 rounded-md border border-[#394252] bg-[#0c1017] p-2 text-stone-200">Fluentia Instructor: AVoss</p></div></div> : <div className="space-y-4"><div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Student Avatar</p><div className="mt-2 grid grid-cols-3 gap-2">{AVATAR_PRESETS.map((preset) => <button key={preset.id} type="button" onClick={() => { setAvatarPreset(preset.id); setCustomAvatarUrl(""); }} aria-label={`Use ${preset.label} avatar`} className={`flex flex-col items-center gap-1 rounded-md border p-2 text-[10px] text-stone-400 transition ${avatarPreset === preset.id && !avatarImage ? "border-amber-500 bg-amber-500/10 text-amber-300" : "border-[#394252] hover:border-amber-500/50"}`}><span style={{ backgroundColor: preset.backgroundColor }} className={`flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-bold ${preset.className}`}>{profileInitials}</span>{preset.label}</button>)}</div><div className="mt-3 flex items-center gap-2 rounded-md border border-[#29303c] bg-[#0c1017] p-2"><span style={!avatarImage ? { backgroundColor: selectedAvatar.backgroundColor } : undefined} className={`flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-[10px] font-bold ${avatarImage ? "bg-[#283344]" : selectedAvatar.className}`}>{avatarImage ? <img src={avatarImage} alt="Custom avatar preview" className="h-full w-full object-cover" /> : profileInitials}</span><span className="text-xs text-stone-400">Live avatar preview</span></div><label className="mt-2 block text-xs text-stone-400">Custom Avatar URL<input value={customAvatarUrl} onChange={(event) => setCustomAvatarUrl(event.target.value)} placeholder="https://..." className="mt-1 w-full rounded-md border border-[#394252] bg-[#0c1017] p-2 text-xs text-stone-200" /></label></div><div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Dashboard Hero Banner</p><div className="mt-2 grid grid-cols-3 gap-2">{BANNER_PRESETS.map((preset) => <button key={preset.id} type="button" onClick={() => { setBannerPreset(preset.id); setCustomBannerUrl(""); }} className={`overflow-hidden rounded-md border text-left transition ${bannerPreset === preset.id && !customBannerUrl ? "border-amber-500" : "border-[#394252] hover:border-amber-500/50"}`}><img src={preset.image} alt="" className="h-10 w-full object-cover opacity-75" /><span className="block truncate px-1.5 py-1 text-[9px] text-stone-400">{preset.label}</span></button>)}</div><label className="mt-2 block text-xs text-stone-400">Custom Banner URL<input value={customBannerUrl} onChange={(event) => setCustomBannerUrl(event.target.value)} placeholder="https://..." className="mt-1 w-full rounded-md border border-[#394252] bg-[#0c1017] p-2 text-xs text-stone-200" /></label></div></div>}
                    </div>
                    <div className="border-t border-[#29303c] bg-[#171d28] p-4"><button type="button" onClick={() => { const preferences = { avatarPreset, customAvatarUrl, bannerPreset, customBannerUrl }; void saveStudentProfile(token, { ...activeStudent.profile, fullName: displayName, avatarUrl: customAvatarUrl, bannerUrl: customBannerUrl }).catch((error) => logDashboardError("Failed to save student profile:", error)); window.localStorage.setItem(`fluentia:profile:${token}`, JSON.stringify(preferences)); window.dispatchEvent(new CustomEvent("fluentia:student-profile-updated", { detail: preferences })); setBannerLoadFailed(false); setProfileOpen(false); }} className="w-full rounded-md bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400">Save settings</button></div>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs text-[#667084]"><UserRound className="h-3.5 w-3.5" />{displayLessons.length} lessons available <span className="text-[#394252]">|</span> B2 Upper Intermediate</div>
          </div>
        </header>

      <div className="mx-auto max-w-5xl px-4 py-8">

        <section className="grid gap-3 border-b border-[#202631] py-6 sm:grid-cols-3" aria-label="Student progress overview">
          <div className="relative order-last rounded-xl border border-[#202631] bg-[#121721] p-4" aria-label="Student profile">
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setProfileOpen((open) => !open)} aria-expanded={profileOpen} aria-controls="student-profile-flyout" style={!avatarImage ? { backgroundColor: selectedAvatar.backgroundColor } : undefined} className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-bold transition hover:ring-2 hover:ring-amber-400/60 ${avatarImage ? "bg-[#283344]" : selectedAvatar.className}`}>
                {avatarImage ? <img src={avatarImage} alt={`${displayName} avatar`} className="h-full w-full object-cover" /> : profileInitials}
              </button>
              <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-stone-100">{displayName}</p><p className="mt-1 truncate text-[10px] text-stone-500">{activeStudent.profile?.level || "B2 Upper Intermediate"}</p></div>
              <button type="button" onClick={() => { setProfileOpen(true); setProfileTab("profile"); }} aria-label="Profile settings" title="Profile settings" className="text-stone-500 transition hover:text-amber-300"><Settings2 className="h-4 w-4" /></button>
            </div>
            {profileOpen && <div id="student-profile-flyout" className="absolute right-0 top-full z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-[#394252] bg-[#171d28] text-left shadow-2xl">
              <div className="flex items-center justify-between gap-3 border-b border-[#29303c] p-4"><div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Student profile</p><p className="mt-1 text-sm font-semibold text-stone-100">{displayName}</p></div><button type="button" onClick={() => setProfileOpen(false)} aria-label="Close profile" className="text-stone-500 hover:text-stone-200"><X className="h-4 w-4" /></button></div>
              <div className="grid grid-cols-2 border-b border-[#29303c] px-4 pt-3"><button type="button" onClick={() => setProfileTab("profile")} className={`border-b-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.12em] ${profileTab === "profile" ? "border-amber-500 text-amber-300" : "border-transparent text-stone-500 hover:text-stone-300"}`}>Profile &amp; Preferences</button><button type="button" onClick={() => setProfileTab("customization")} className={`border-b-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.12em] ${profileTab === "customization" ? "border-amber-500 text-amber-300" : "border-transparent text-stone-500 hover:text-stone-300"}`}>Customization</button></div>
              <div className="space-y-4 p-4 text-xs">{profileTab === "profile" ? <><div className="grid grid-cols-2 gap-3"><div><p className="text-stone-500">Name</p><p className="mt-1 text-stone-200">{displayName}</p></div><div><p className="text-stone-500">Progress</p><p className="mt-1 text-stone-200">{completedLessons} / {displayLessons.length} lessons</p></div></div><div className="grid grid-cols-2 gap-3"><div><p className="text-stone-500">Level</p><p className="mt-1 rounded-md border border-[#394252] bg-[#0c1017] p-2 text-stone-200">{activeStudent.profile?.level || "Not set"}</p></div><div><p className="text-stone-500">Learning goal</p><p className="mt-1 rounded-md border border-[#394252] bg-[#0c1017] p-2 text-stone-200">{activeStudent.profile?.targetGoal || "Not set"}</p></div></div><div className="border-t border-[#29303c] pt-3"><p className="text-stone-500">Assigned instructor</p><p className="mt-1 rounded-md border border-[#394252] bg-[#0c1017] p-2 text-stone-200">Fluentia Instructor: AVoss</p></div></> : <><div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Theme options</p><div className="mt-2 flex gap-2"><button type="button" className="rounded-md border border-amber-500 bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-300">Dark</button><span className="rounded-md border border-[#394252] px-2 py-1.5 text-[10px] text-stone-500">Fluentia dark theme</span></div></div><label className="block text-stone-400">Custom Avatar URL<input value={customAvatarUrl} onChange={(event) => setCustomAvatarUrl(event.target.value)} placeholder="https://..." className="mt-1 w-full rounded-md border border-[#394252] bg-[#0c1017] p-2 text-xs text-stone-200" /></label><label className="block text-stone-400">Custom Banner URL<input value={customBannerUrl} onChange={(event) => setCustomBannerUrl(event.target.value)} placeholder="https://..." className="mt-1 w-full rounded-md border border-[#394252] bg-[#0c1017] p-2 text-xs text-stone-200" /></label></>}</div>
              <div className="border-t border-[#29303c] bg-[#171d28] p-4"><button type="button" onClick={() => { const preferences = { avatarPreset, customAvatarUrl, bannerPreset, customBannerUrl }; void saveStudentProfile(token, { ...activeStudent.profile, fullName: displayName, avatarUrl: customAvatarUrl, bannerUrl: customBannerUrl }).catch((error) => logDashboardError("Failed to save student profile:", error)); window.localStorage.setItem(`fluentia:profile:${token}`, JSON.stringify(preferences)); window.dispatchEvent(new CustomEvent("fluentia:student-profile-updated", { detail: preferences })); setBannerLoadFailed(false); setProfileOpen(false); }} className="w-full rounded-md bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400">Save settings</button></div>
            </div>}
          </div>
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
            {displayLessons[0] && <Link href={getLessonHref(displayLessons[0], getLessonStatus(lessonStates[displayLessons[0].id]))} onClick={() => rememberLesson(displayLessons[0].id)} className="text-xs font-semibold text-amber-300 hover:text-amber-200">Open Study Room</Link>}
          </div>
          {currentCard ? <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center"><button type="button" onClick={() => setShowDefinition((shown) => !shown)} className="flex min-h-24 flex-1 items-center justify-center rounded-lg border border-amber-500/30 bg-[#0c1017] p-4 text-center transition hover:border-amber-400"><span className="font-[var(--font-fraunces)] text-2xl text-stone-100">{showDefinition ? currentCard.definition : currentCard.word}</span></button><div className="flex items-center justify-between gap-4 sm:w-36 sm:flex-col"><span className="text-xs text-stone-500">{cardIndex + 1} / {savedWords.length} cards</span><button type="button" onClick={() => { setCardIndex((index) => (index + 1) % savedWords.length); setShowDefinition(false); }} className="text-xs font-semibold text-amber-300 hover:text-amber-200">Next card</button></div></div> : <p className="mt-4 rounded-lg border border-dashed border-[#394252] p-4 text-sm text-stone-500">Save words in the Study Room dictionary to build your first deck.</p>}
        </section>

        {nextLesson && <section className="mt-6" aria-label="Continue learning">
          <Link href={getLessonHref(nextLesson, getLessonStatus(lessonStates[nextLesson.id]))} onClick={() => rememberLesson(nextLesson.id)} style={instructorLessonBanner ? { backgroundImage: `url(${instructorLessonBanner})` } : undefined} className="group relative block h-64 overflow-hidden rounded-xl border border-amber-500/30 bg-cover bg-center bg-no-repeat transition-colors hover:border-amber-400/70">
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(7,11,17,.95),rgba(7,11,17,.6)_52%,rgba(7,11,17,.82)),linear-gradient(0deg,rgba(7,11,17,.92),transparent_65%)]" />
            <div className="relative flex h-full flex-col justify-between p-5 md:p-7"><div><div className="flex items-center gap-2 text-amber-400"><Flame className="h-4 w-4" /><span className="text-[10px] font-semibold uppercase tracking-[0.16em]">Continue Learning / Next Up</span></div><h2 className="mt-2 font-[var(--font-fraunces)] text-2xl font-semibold text-stone-100 md:text-3xl">{nextLesson.title}</h2><p className="mt-2 max-w-2xl text-sm text-stone-300">{nextLesson.content?.subtitle || "Continue your personalized language practice."}</p></div><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div className="w-full max-w-xs"><div className="flex items-center justify-between text-xs text-stone-300"><span>{progressPercent}% course progress</span><span>{completedLessons}/{displayLessons.length}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-[#0c1017]/80"><div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${progressPercent}%` }} /></div></div><span className="inline-flex w-fit items-center rounded-md bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 transition group-hover:bg-amber-400">Start Lesson <span className="ml-2" aria-hidden="true">-&gt;</span></span></div></div>
          </Link>
        </section>}

        {!nextLesson && <section className="mt-6" aria-label="Continue learning"><div className="flex h-64 flex-col justify-center rounded-xl border border-[#202631] bg-[#121721] p-5 md:p-7"><div className="flex items-center gap-2 text-amber-400"><Flame className="h-4 w-4" /><span className="text-[10px] font-semibold uppercase tracking-[0.16em]">Continue Learning / Next Up</span></div><h2 className="mt-2 font-[var(--font-fraunces)] text-2xl font-semibold text-stone-100 md:text-3xl">No active lesson assigned</h2><p className="mt-2 text-sm text-stone-400">Your instructor will publish a lesson here when it is ready.</p></div></section>}

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
            const status = getLessonStatus(lessonStates[lesson.id]);
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
              key={lesson.id}
              className="group overflow-hidden rounded-xl border border-[#202631] bg-[#121721] transition-colors hover:border-amber-500/50"
            >
              <div className="relative h-44 overflow-hidden border-b border-[#202631]">
                <img src={(typeof lesson.content?.coverImage === "string" ? lesson.content.coverImage : typeof lesson.content?.bannerUrl === "string" ? lesson.content.bannerUrl : undefined) || BANNER_PRESETS[0].image} alt="" className="h-full w-full object-cover opacity-70 transition duration-500 group-hover:scale-105 group-hover:opacity-85" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#121721] via-transparent to-transparent" />
                  <span className="absolute bottom-4 left-5 rounded-sm border border-[#a77b25] bg-[#332713]/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#dca42f]">
                  Module {lesson.content?.moduleNumber || 1}
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
                  <p className="mt-2 text-sm leading-relaxed text-stone-400">{lesson.content?.subtitle || "Continue your personalized language practice."}</p>
                  <p className="mt-3 flex items-center gap-2 text-[11px] text-stone-500"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#283344] text-[8px] font-semibold text-[#d9a63b]">{lesson.content?.instructor?.initials || ""}</span> Guided by {lesson.content?.instructor?.fullName || "Your instructor"}</p>
                </div>
                <Link href={getLessonHref(lesson, status)} onClick={() => rememberLesson(lesson.id)} className={`mt-5 inline-flex rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
                  status === "completed"
                    ? "bg-emerald-500 text-[#0c1017]"
                    : "bg-amber-500 text-[#0c1017] group-hover:bg-amber-400"
                }`}>
                  {ctaCopy}
                </Link>
                {status === "completed" && lessonStates[lesson.id]?.evaluation?.published && (
                  <details className="mt-5 border-t border-[#202631] pt-4">
                    <summary className="cursor-pointer text-xs font-semibold text-amber-300 hover:text-amber-200">View analytical report</summary>
                    <div className="mt-4 grid gap-3 text-sm text-stone-400 sm:grid-cols-2">
                      <div><p className="text-xs font-semibold text-stone-300">Rubrics</p><p className="mt-1 text-amber-300">{Object.entries(lessonStates[lesson.id]?.evaluation?.scores || {}).map(([criterion, score]) => `${criterion}: ${score}`).join(" | ") || "No rubric scores recorded."}</p></div>
                      <div><p className="text-xs font-semibold text-stone-300">Strengths</p><p className="mt-1 whitespace-pre-wrap">{lessonStates[lesson.id]?.evaluation?.strengths || "No strengths recorded."}</p></div>
                      <div><p className="text-xs font-semibold text-stone-300">Areas to Improve</p><p className="mt-1 whitespace-pre-wrap">{lessonStates[lesson.id]?.evaluation?.areasToImprove || "No improvement areas recorded."}</p></div>
                      <div><p className="text-xs font-semibold text-stone-300">Feedback</p><p className="mt-1 whitespace-pre-wrap">{lessonStates[lesson.id]?.evaluation?.comments || "No comments recorded."}</p></div>
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

export default function DashboardPage() {
  return <DashboardContent />;
}