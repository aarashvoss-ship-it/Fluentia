"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  CheckCircle2,
  Clock3,
  Flame,
  Layers3,
  MessageSquareText,
  PanelRight,
  Settings2,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import { type StudentUser } from "@/lib/users";
import {
  PublishedLessonState,
  writeLastAccessedLesson,
} from "@/lib/lesson-store";
import { getLessonsByStudentId, type LessonWithVersion } from "@/lib/lessons";
import {
  FLUENTIA_DATA_UPDATED_EVENT,
  fetchLessonState,
  fetchSavedVocabulary,
  fetchStudentNotes,
  removeVocabularyWord,
  saveChatMessage,
  saveStudentNote,
  saveVocabularyWord,
} from "@/services/storage-service";
import { ChatMessage, SavedVocabularyWord, StudentNote } from "@/types/lesson";
import { DictionaryModal } from "@/components/study-room/dictionary-modal";
import { Tooltip } from "@/components/shared/tooltip";
import { LearningSidebar } from "@/components/study-room/learning-sidebar";
import { ChatWidget } from "@/components/study-room/chat-widget";
import { DisplaySettingsControl } from "@/components/shared/display-settings";
import { AccessCard } from "@/components/access/access-card";
import {
  getStudentProfile,
  getStudentProfileNote,
  saveStudentProfile,
} from "@/lib/student-profiles";
import { createBrowserClient } from "@supabase/ssr";
import { getBannerPositionStyles, normalizeBannerDimness, normalizeBannerPosition } from "@/lib/banner-position";
import { HeroBanner, HeroBannerContent, HeroBannerLogo } from "@/components/shared/hero-banner";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { flowType: "pkce" } },
);

type LessonStatus =
  | "not-started"
  | "in-progress"
  | "pending-review"
  | "completed";

const AVATAR_PRESETS = [
  {
    id: "amber",
    label: "Amber Gold",
    backgroundColor: "#fbbf24",
    className: "text-slate-950",
  },
  {
    id: "indigo",
    label: "Midnight Indigo",
    backgroundColor: "#4f46e5",
    className: "text-white",
  },
  {
    id: "emerald",
    label: "Emerald Slate",
    backgroundColor: "#10b981",
    className: "text-slate-950",
  },
  {
    id: "crimson",
    label: "Crimson Red",
    backgroundColor: "#dc2626",
    className: "text-white",
  },
] as const;

const BANNER_PRESETS = [
  {
    id: "default-dark",
    label: "Default",
    image:
      "https://images.unsplash.com/photo-1460551204960-763bc82b7d8f?q=80&w=1172&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  },
  {
    id: "mountains",
    label: "Preset 2",
    image:
      "https://plus.unsplash.com/premium_photo-1664303991463-36449a65d3d6?q=80&w=1170&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  },
  {
    id: "architecture",
    label: "Preset 3",
    image:
      "https://images.unsplash.com/photo-1674340344714-60088fbfbde3?q=80&w=747&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  },
] as const;

type ProfilePreferences = {
  level?: string;
  targetGoal?: string;
  avatarPreset?: (typeof AVATAR_PRESETS)[number]["id"];
  avatar_bg_color?: string;
  avatar_initials?: string;
  avatar_url?: string;
  custom_avatar_url?: string;
  banner_url?: string;
  customAvatarUrl?: string;
  bannerPreset?: (typeof BANNER_PRESETS)[number]["id"];
  customBannerUrl?: string;
  bannerPosition?: number;
  banner_position?: number;
  dashboardBannerDimness?: number;
  dashboard_banner_dimness?: number;
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
  const details =
    error && typeof error === "object" ? (error as DashboardError) : undefined;
  console.error(context, {
    code: details?.code,
    message: details?.message || String(error),
    details: details?.details,
    hint: details?.hint,
  });
}

function getLessonStatus(state?: PublishedLessonState | null): LessonStatus {
  if (!state || state.status === "draft") return "not-started";
  if (state.submission?.status === "reviewed" || state.submission?.status === "evaluated" || state.evaluation.published)
    return "completed";
  if (state.submission?.status === "submitted" || state.submission?.status === "pending_evaluation") return "pending-review";
  if (state.submission?.status === "in_progress") return "in-progress";
  return "not-started";
}

function getLessonStatusCopy(status: LessonStatus) {
  return status === "completed"
    ? "COMPLETED"
    : status === "pending-review"
      ? "PENDING EVALUATION"
      : status === "in-progress"
        ? "IN PROGRESS"
        : "NOT STARTED";
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
  const lessonsRef = useRef<LessonWithVersion[]>([]);
  const [lessonStates, setLessonStates] = useState<
    Record<string, PublishedLessonState | null>
  >({});
  const [savedWords, setSavedWords] = useState<SavedVocabularyWord[]>([]);
  const [cardIndex, setCardIndex] = useState(0);
  const [showDefinition, setShowDefinition] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dictionaryOpen, setDictionaryOpen] = useState(false);
  const [notes, setNotes] = useState<StudentNote[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileTab, setProfileTab] = useState<"profile" | "customization">(
    "profile",
  );
  const [avatarPreset, setAvatarPreset] =
    useState<ProfilePreferences["avatarPreset"]>("amber");
  const [avatarColor, setAvatarColor] = useState<string>(AVATAR_PRESETS[0].backgroundColor);
  const [avatarInitials, setAvatarInitials] = useState("");
  const [customAvatarUrl, setCustomAvatarUrl] = useState("");
  const [bannerPreset, setBannerPreset] =
    useState<ProfilePreferences["bannerPreset"]>("default-dark");
  const [customBannerUrl, setCustomBannerUrl] = useState("");
  const [bannerPosition, setBannerPosition] = useState(50);
  const [dashboardBannerDimness, setDashboardBannerDimness] = useState(20);
  const [profileImageStatus, setProfileImageStatus] = useState<string | null>(null);
  const [profileSaveNotice, setProfileSaveNotice] = useState<string | null>(null);
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);
  const [isSavingProfileCustomization, setIsSavingProfileCustomization] = useState(false);
  const avatarFileRef = useRef<HTMLInputElement | null>(null);
  const bannerFileRef = useRef<HTMLInputElement | null>(null);
  const [bannerLoadFailed, setBannerLoadFailed] = useState(false);
  const [savedInstructorNote, setSavedInstructorNote] = useState("");

  const [dictionaryWord, setDictionaryWord] = useState<string | null>(null);

  useEffect(() => {
    function onDblClick(e: MouseEvent) {
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, button, a, [role=dialog]")) return;
      const sel = window.getSelection()?.toString().trim() || "";
      const w = sel.match(/^[a-zA-Z]+(?:[-'][a-zA-Z]+)*$/)?.[0];
      if (w && w.length > 1) setDictionaryWord(w);
    }
    document.addEventListener("dblclick", onDblClick);
    return () => document.removeEventListener("dblclick", onDblClick);
  }, []);

  useEffect(() => {
    const readCustomization = () => {
      try {
        const stored = window.localStorage.getItem("student_customization");
        if (!stored) return;
        const customization = JSON.parse(stored) as Partial<ProfilePreferences>;
        const color = customization.avatar_bg_color;
        const preset = AVATAR_PRESETS.find((option) => option.backgroundColor === color);
        if (preset) setAvatarPreset(preset.id);
        if (color) setAvatarColor(color);
        setAvatarInitials((customization.avatar_initials || "").replace(/[^a-z0-9]/gi, "").slice(0, 3).toUpperCase());
        const avatarUrl = typeof customization.custom_avatar_url === "string"
          ? customization.custom_avatar_url
          : customization.avatar_url || "";
        setCustomAvatarUrl(avatarUrl);
        setCustomBannerUrl(customization.banner_url || "");
        if (typeof customization.banner_position === "number") {
          setBannerPosition(customization.banner_position);
        }
        setDashboardBannerDimness(normalizeBannerDimness(customization.dashboard_banner_dimness ?? customization.dashboardBannerDimness));
        setActiveStudent((current) => current ? {
          ...current,
          profile: {
            ...current.profile,
            avatarBgColor: color || current.profile.avatarBgColor,
            avatarInitials: customization.avatar_initials || current.profile.avatarInitials,
            avatarUrl,
            bannerUrl: customization.banner_url || current.profile.bannerUrl,
          },
        } : current);
      } catch (error) {
        logDashboardError("Dashboard customization fallback could not be read:", error);
      }
    };
    const handleProfileUpdated = () => readCustomization();
    const handleStorage = (event: StorageEvent) => {
      if (event.key === "student_customization") readCustomization();
    };

    readCustomization();
    window.addEventListener("profile-updated", handleProfileUpdated);
    window.addEventListener("fluentia:student-profile-updated", handleProfileUpdated);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("profile-updated", handleProfileUpdated);
      window.removeEventListener("fluentia:student-profile-updated", handleProfileUpdated);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    const studentToken = activeStudent?.token;
    if (!studentToken) return;
    console.log("[Student Dashboard] profile load identifier:", {
      studentToken,
      studentId: activeStudent.id,
    });

    const loadInstructorNote = async () => {
      try {
        const remoteProfile = await getStudentProfile(studentToken);
        if (!remoteProfile) return;
        setActiveStudent((current) => current ? {
          ...current,
          name: remoteProfile.fullName || current.name,
          profile: {
            ...current.profile,
            ...remoteProfile,
            fullName: remoteProfile.fullName || current.profile.fullName,
            level: remoteProfile.level || current.profile.level,
            targetGoal: remoteProfile.targetGoal || current.profile.targetGoal,
            assignedInstructor: remoteProfile.assignedInstructor || current.profile.assignedInstructor,
            teacherNotes: remoteProfile.teacherNotes || current.profile.teacherNotes,
          },
        } : current);
        setSavedInstructorNote(getStudentProfileNote(remoteProfile as Record<string, unknown>));
      } catch (error) {
        logDashboardError("Student profile could not be loaded from Supabase:", error);
      }
    };

    const refreshInstructorNote = () => void loadInstructorNote();
    void loadInstructorNote();
    window.addEventListener("storage", refreshInstructorNote);
    window.addEventListener(FLUENTIA_DATA_UPDATED_EVENT, refreshInstructorNote);
    return () => {
      window.removeEventListener("storage", refreshInstructorNote);
      window.removeEventListener(
        FLUENTIA_DATA_UPDATED_EVENT,
        refreshInstructorNote,
      );
    };
  }, [activeStudent?.token]);

  useEffect(() => {
    const identifiers = [...new Set([activeStudent?.id, activeStudent?.token].filter((value): value is string => Boolean(value)))];
    if (identifiers.length === 0) return;

    const readBadgeSettings = () => {
      try {
        const readScopedValue = (key: string) => identifiers
          .map((identifier) => window.localStorage.getItem(`${key}:${identifier}`))
          .find((value) => value !== null);
        const color = readScopedValue("student_badge_color");
        const initials = readScopedValue("student_badge_initials");
        if (color) {
          setAvatarColor(color);
          const preset = AVATAR_PRESETS.find((option) => option.backgroundColor === color);
          if (preset) setAvatarPreset(preset.id);
        }
        if (initials !== undefined) setAvatarInitials((initials || "").replace(/[^a-z]/gi, "").slice(0, 3).toUpperCase());
        if (color || initials !== undefined) {
          setActiveStudent((current) => current ? {
            ...current,
            profile: {
              ...current.profile,
              ...(color ? { avatarBgColor: color } : {}),
              ...(initials !== undefined ? { avatarInitials: (initials || "").replace(/[^a-z]/gi, "").slice(0, 3).toUpperCase() } : {}),
            },
          } : current);
        }
      } catch (error) {
        logDashboardError("Student badge preferences could not be restored:", error);
      }
    };

    readBadgeSettings();
    const handleStorage = (event: StorageEvent) => {
      if (identifiers.some((identifier) => event.key === `student_badge_color:${identifier}` || event.key === `student_badge_initials:${identifier}`)) {
        readBadgeSettings();
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [activeStudent?.id, activeStudent?.token]);

  useEffect(() => {
    if (!profileOpen || !activeStudent?.token) return;
    const studentToken = activeStudent.token;
    void getStudentProfile(studentToken)
      .then((profile) => {
        if (!profile) return;
        let localCustomization: Partial<ProfilePreferences> = {};
        let localPreferences: ProfilePreferences = {};
        try {
          localCustomization = JSON.parse(window.localStorage.getItem("student_customization") || "{}") as Partial<ProfilePreferences>;
          localPreferences = JSON.parse(window.localStorage.getItem(`fluentia:profile:${studentToken}`) || "{}") as ProfilePreferences;
        } catch {
          // The persisted profile remains the source of truth if local fallback data is malformed.
        }
        const savedColor = profile.avatarBgColor || localPreferences.avatar_bg_color || localCustomization.avatar_bg_color || AVATAR_PRESETS[0].backgroundColor;
        setAvatarColor(savedColor);
        const savedPreset = AVATAR_PRESETS.find((preset) => preset.backgroundColor === savedColor);
        setAvatarPreset(savedPreset?.id || localPreferences.avatarPreset || "amber");
        const savedInitials = profile.avatarInitials ?? localPreferences.avatar_initials ?? localCustomization.avatar_initials ?? "";
        setAvatarInitials(savedInitials.replace(/[^a-z]/gi, "").slice(0, 3).toUpperCase());
        setCustomAvatarUrl(profile.avatarUrl || localPreferences.customAvatarUrl || localPreferences.avatar_url || localCustomization.custom_avatar_url || localCustomization.avatar_url || "");
        setCustomBannerUrl(profile.bannerUrl || localPreferences.customBannerUrl || localPreferences.banner_url || localCustomization.banner_url || "");
        setBannerPreset(localPreferences.bannerPreset || "default-dark");
        const savedBannerPosition = localPreferences.bannerPosition ?? localPreferences.banner_position ?? localCustomization.banner_position;
        setBannerPosition(typeof savedBannerPosition === "number" ? savedBannerPosition : 50);
        setDashboardBannerDimness(normalizeBannerDimness(
          localPreferences.dashboardBannerDimness ?? localPreferences.dashboard_banner_dimness
            ?? localCustomization.dashboard_banner_dimness ?? localCustomization.dashboardBannerDimness,
        ));
        console.log("[Student Profile Modal] profile load identifier:", {
          studentToken,
          studentId: activeStudent.id,
        });
        setActiveStudent((current) =>
          current
            ? {
                ...current,
                profile: {
                  ...current.profile,
                  ...profile,
                  fullName: profile.fullName || current.profile.fullName,
                  level: profile.level || current.profile.level,
                  targetGoal:
                    profile.core_goal ||
                    profile.learningGoal ||
                    profile.targetGoal ||
                    current.profile.targetGoal,
                  assignedInstructor:
                    profile.assignedInstructor ||
                    current.profile.assignedInstructor,
                  core_goal: profile.core_goal || current.profile.core_goal,
                  learningGoal:
                    profile.learningGoal || current.profile.learningGoal,
                  teacherNotes:
                    profile.teacherNotes || current.profile.teacherNotes,
                },
              }
            : current,
        );
        setSavedInstructorNote(
          getStudentProfileNote(profile as Record<string, unknown>),
        );
      })
      .catch(() => {
        // The dashboard's existing local profile state remains visible.
      });
  }, [profileOpen, activeStudent?.token]);

  useEffect(() => {
    const loadDashboard = async (userId: string) => {
      const [lessonResult, vocabularyResult, notesResult] =
        await Promise.allSettled([
          getLessonsByStudentId(userId),
          fetchSavedVocabulary(userId),
          fetchStudentNotes(userId),
        ]);
      if (lessonResult.status === "rejected")
        logDashboardError(
          "Dashboard lesson loading failed:",
          lessonResult.reason,
        );
      if (vocabularyResult.status === "rejected")
        logDashboardError(
          "Dashboard vocabulary loading failed:",
          vocabularyResult.reason,
        );
      if (notesResult.status === "rejected")
        logDashboardError(
          "Dashboard notes loading failed:",
          notesResult.reason,
        );

      const lessonRows =
        lessonResult.status === "fulfilled"
          ? lessonResult.value
          : lessonsRef.current;
      const savedWords =
        vocabularyResult.status === "fulfilled" ? vocabularyResult.value : [];
      const studentNotes =
        notesResult.status === "fulfilled" ? notesResult.value : [];
      const availableLessons = lessonRows;
      if (lessonResult.status === "fulfilled") {
        lessonsRef.current = lessonRows;
        setLessons(lessonRows);
      }
      const lessonStateResults = await Promise.allSettled(
        availableLessons.map(
          async (lesson) =>
            [lesson.id, await fetchLessonState(lesson.id, userId)] as const,
        ),
      );
      lessonStateResults.forEach((result) => {
        if (result.status === "rejected")
          logDashboardError(
            "Dashboard lesson-state loading failed:",
            result.reason,
          );
      });
      const nextLessonStates = Object.fromEntries(
        lessonStateResults
          .filter(
            (
              result,
            ): result is PromiseFulfilledResult<
              readonly [string, PublishedLessonState | null]
            > => result.status === "fulfilled",
          )
          .map((result) => result.value),
      );
      setLessonStates(nextLessonStates);
      const completedModulesCount = availableLessons.filter(
        (lesson) =>
          getLessonStatus(nextLessonStates[lesson.id]) === "completed",
      ).length;
      setActiveStudent((previous) =>
        previous
          ? {
              ...previous,
              role: "student",
              profile: { ...previous.profile, completedModulesCount },
            }
          : previous,
      );
      setSavedWords(savedWords);
      setNotes(studentNotes);
    };
    const loadAuthenticatedDashboard = async () => {
      try {
        const { data: userData, error: userError } =
          await supabase.auth.getUser();
        if (userError || !userData.user) {
          logDashboardError(
            "Dashboard client session lookup failed after server authentication:",
            userError || new Error("No authenticated user was returned"),
          );
          setAccessDenied(true);
          setIsMounted(true);
          return;
        }

        const { data: roleProfile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", userData.user.id)
          .maybeSingle();
        const instructorProfile = roleProfile
          ? null
          : (
              await supabase
                .from("instructors")
                .select("id")
                .eq("id", userData.user.id)
                .maybeSingle()
            ).data;
        if (
          roleProfile?.role === "instructor" ||
          roleProfile?.role === "admin" ||
          instructorProfile
        ) {
          router.replace("/instructor");
          return;
        }
        if (roleProfile?.role && roleProfile.role !== "student") {
          setAccessDenied(true);
          setIsMounted(true);
          return;
        }

        const userEmail = userData.user.email?.trim().toLowerCase() || "";
        let student: {
          id: string;
          name: string;
          email: string;
          token: string;
        } | null = null;
        try {
          const { data: studentRow, error: studentError } = await supabase
            .from("students")
            .select("id, name, email, token")
            .or(`id.eq.${userData.user.id},email.eq.${userEmail}`)
            .maybeSingle();

          if (studentError && studentError.code !== "PGRST116") {
            logDashboardError(
              "Dashboard student lookup unavailable; using session metadata:",
              studentError,
            );
          } else if (!studentError) {
            student = studentRow;
          }
        } catch (error) {
          logDashboardError(
            "Dashboard student lookup threw an error; using session metadata:",
            error,
          );
        }

        const resolvedStudentId = student?.id || userData.user.id;
        const fallbackName =
          userData.user.user_metadata?.name || userEmail || "Student";
        const userMetadata = userData.user.user_metadata as Record<string, unknown>;

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
            avatarBgColor: typeof roleProfile?.avatar_bg_color === "string"
              ? roleProfile.avatar_bg_color
              : typeof userMetadata.avatar_bg_color === "string" ? userMetadata.avatar_bg_color : undefined,
            avatarInitials: typeof roleProfile?.avatar_initials === "string"
              ? roleProfile.avatar_initials
              : typeof userMetadata.avatar_initials === "string" ? userMetadata.avatar_initials : undefined,
            avatarUrl: typeof roleProfile?.avatar_url === "string"
              ? roleProfile.avatar_url
              : typeof userMetadata.custom_avatar_url === "string"
                ? userMetadata.custom_avatar_url
                : typeof userMetadata.avatar_url === "string" ? userMetadata.avatar_url : undefined,
            bannerUrl: typeof roleProfile?.banner_url === "string"
              ? roleProfile.banner_url
              : typeof userMetadata.banner_url === "string" ? userMetadata.banner_url : undefined,
            weaknesses: [],
            teacherNotes: "",
            attendanceRate: 0,
            completedModulesCount: 0,
          },
        };

        setActiveStudent(active);
        const studentToken = resolvedStudentId;
        const storedProfile = window.localStorage.getItem(
          `fluentia:profile:${studentToken}`,
        );
        let localCustomization: Partial<ProfilePreferences> = {};
        try {
          const storedCustomization = window.localStorage.getItem("student_customization");
          localCustomization = storedCustomization
            ? JSON.parse(storedCustomization) as Partial<ProfilePreferences>
            : {};
        } catch (error) {
          logDashboardError("Dashboard shared customization could not be parsed:", error);
        }
        let preferences: ProfilePreferences = {};
        try {
          preferences = storedProfile
            ? (JSON.parse(storedProfile) as ProfilePreferences)
            : {};
        } catch (error) {
          logDashboardError(
            "Dashboard local profile preferences could not be parsed:",
            error,
          );
          window.localStorage.removeItem(`fluentia:profile:${studentToken}`);
        }
        const metadataAvatarColor = typeof userMetadata.avatar_bg_color === "string"
          ? userMetadata.avatar_bg_color
          : "";
        const profileAvatarColor = typeof roleProfile?.avatar_bg_color === "string"
          ? roleProfile.avatar_bg_color
          : "";
        const savedAvatarColor = profileAvatarColor || preferences.avatar_bg_color || localCustomization.avatar_bg_color || metadataAvatarColor;
        const colorPreset = AVATAR_PRESETS.find((preset) => preset.backgroundColor === savedAvatarColor)?.id;
        setAvatarPreset(colorPreset || preferences.avatarPreset || "amber");
        setAvatarColor(savedAvatarColor || AVATAR_PRESETS[0].backgroundColor);
        const profileAvatarInitials = typeof roleProfile?.avatar_initials === "string"
          ? roleProfile.avatar_initials
          : "";
        const savedAvatarInitials = (profileAvatarInitials || preferences.avatar_initials || localCustomization.avatar_initials
          || (typeof userMetadata.avatar_initials === "string" ? userMetadata.avatar_initials : ""))
          .replace(/[^a-z]/gi, "")
          .slice(0, 3)
          .toUpperCase();
        setAvatarInitials(savedAvatarInitials);
        setActiveStudent((current) => current ? {
          ...current,
          profile: {
            ...current.profile,
            avatarBgColor: savedAvatarColor || AVATAR_PRESETS[0].backgroundColor,
            avatarInitials: savedAvatarInitials,
          },
        } : current);
        const savedAvatarUrl = active.profile.avatarUrl
          || preferences.customAvatarUrl
          || preferences.avatar_url
          || localCustomization.custom_avatar_url
          || localCustomization.avatar_url
          || (typeof userMetadata.custom_avatar_url === "string" ? userMetadata.custom_avatar_url : "")
          || (typeof userMetadata.avatar_url === "string" ? userMetadata.avatar_url : "");
        setCustomAvatarUrl(savedAvatarUrl);
        setBannerPreset(preferences.bannerPreset || "default-dark");
        setCustomBannerUrl(
          active.profile.bannerUrl || preferences.customBannerUrl || preferences.banner_url || localCustomization.banner_url || "",
        );
        const savedBannerPosition = preferences.bannerPosition ?? preferences.banner_position ?? localCustomization.banner_position ?? userMetadata.banner_position;
        setBannerPosition(typeof savedBannerPosition === "number" && Number.isFinite(savedBannerPosition) ? savedBannerPosition : 50);
        setDashboardBannerDimness(normalizeBannerDimness(
          preferences.dashboardBannerDimness ?? preferences.dashboard_banner_dimness
            ?? localCustomization.dashboard_banner_dimness ?? localCustomization.dashboardBannerDimness
            ?? userMetadata.dashboard_banner_dimness,
        ));
        setIsMounted(true);
        const refreshLessons = () =>
          void loadDashboard(studentToken).catch((error) =>
            logDashboardError("Dashboard refresh failed:", error),
          );
        void loadDashboard(studentToken).catch((error) =>
          logDashboardError("Dashboard initial data loading failed:", error),
        );
        window.addEventListener("storage", refreshLessons);
        window.addEventListener(FLUENTIA_DATA_UPDATED_EVENT, refreshLessons);
        window.addEventListener("fluentia:lesson-updated", refreshLessons);
        return () => {
          window.removeEventListener("storage", refreshLessons);
          window.removeEventListener(
            FLUENTIA_DATA_UPDATED_EVENT,
            refreshLessons,
          );
          window.removeEventListener("fluentia:lesson-updated", refreshLessons);
        };
      } catch (error) {
        logDashboardError("Dashboard authentication setup failed:", error);
        setAccessDenied(true);
        setIsMounted(true);
      }
    };

    let cleanup: (() => void) | undefined;
    void loadAuthenticatedDashboard().then((result) => {
      cleanup = result;
    });
    return () => {
      cleanup?.();
    };
  }, [router]);

  if (!isMounted) {
    return <main className="min-h-screen bg-[#0c1017] text-[#e8e7e4]" />;
  }

  if (accessDenied || !activeStudent) {
    return (
      <AccessCard
        title="Student access required"
        message="Sign in with an authorized student account to open your dashboard."
      />
    );
  }

  const token = activeStudent.token;
  const displayLessons = [...lessons].sort((left, right) => {
    const createdOrder = Date.parse(right.created_at) - Date.parse(left.created_at);
    return Number.isFinite(createdOrder) ? createdOrder : 0;
  });
  const nextLesson = displayLessons.find((lesson) => {
    const status = getLessonStatus(lessonStates[lesson.id]);
    return status !== "completed" && status !== "pending-review";
  });
  const nextLessonStatus = nextLesson
    ? getLessonStatus(lessonStates[nextLesson.id])
    : null;
  const completedLessons = new Set(
    displayLessons
      .filter((lesson) => {
        const status = getLessonStatus(lessonStates[lesson.id]);
        return status === "completed" || status === "pending-review";
      })
      .map((lesson) => lesson.id),
  ).size;
  const hasPendingReview = displayLessons.some(
    (lesson) => getLessonStatus(lessonStates[lesson.id]) === "pending-review",
  );
  const hasFeedback = displayLessons.some(
    (lesson) => getLessonStatus(lessonStates[lesson.id]) === "completed",
  );
  const instructorNote =
    savedInstructorNote ||
    activeStudent?.profile?.instructor_notes ||
    activeStudent?.profile?.dashboard_note ||
    activeStudent?.profile?.teacherNotes ||
    lessonStates[displayLessons[0]?.id]?.studentProfile?.teacherNotes ||
    "Your instructor will add personalized guidance here.";
  const studentLevel = activeStudent.profile?.level?.trim() || "Not set";
  const studentLearningGoal =
    activeStudent.profile?.targetGoal?.trim() || "Not set";
  const dashboardResources =
    ((lessonStates[displayLessons[0]?.id] as unknown as Record<string, unknown>)
      ?.lessonResources as
      | { id: string; title: string; url: string; type: string }[]
      | undefined) || [];
  const latestReport = lessonStates[displayLessons[0]?.id]?.evaluation;
  const currentCard = savedWords[cardIndex % Math.max(savedWords.length, 1)];
  const inProgressLessons = displayLessons.filter(
    (lesson) => getLessonStatus(lessonStates[lesson.id]) === "in-progress",
  ).length;
  const progressPercent = displayLessons.length
    ? Math.round((completedLessons / displayLessons.length) * 100)
    : 0;
  const displayName = activeStudent.name;
  const profileInstructorName =
    activeStudent.profile?.assignedInstructor?.trim();
  const lessonInstructorName =
    nextLesson?.content?.instructor?.fullName?.trim();
  const assignedInstructorName =
    profileInstructorName || lessonInstructorName || "Fluentia Instructor";
  const assignedInstructorInitials =
    activeStudent.profile?.assignedInstructorInitials?.trim() ||
    nextLesson?.content?.instructor?.initials?.trim() ||
    assignedInstructorName
      .split(/\s+/)
      .map((part: string) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  const defaultProfileInitials = displayName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const customizedInitials = avatarInitials.trim().replace(/[^a-z0-9]/gi, "").slice(0, 3).toUpperCase();
  const profileInitials = activeStudent.profile?.avatarInitials || customizedInitials || defaultProfileInitials;
  const visibleAvatarInitials = customizedInitials || defaultProfileInitials;
  const selectedAvatar =
    AVATAR_PRESETS.find((preset) => preset.id === avatarPreset) ||
    AVATAR_PRESETS[0];
  const badgeColor = activeStudent.profile?.avatarBgColor || avatarColor || "#fbbf24";
  const selectedBanner =
    BANNER_PRESETS.find((preset) => preset.id === bannerPreset) ||
    BANNER_PRESETS[0];
  const hasCustomBanner = isValidImageUrl(customBannerUrl.trim());
  const activeBannerUrl = hasCustomBanner
    ? customBannerUrl.trim()
    : selectedBanner.image;
  const dashboardHeaderBanner = bannerLoadFailed
    ? BANNER_PRESETS[0].image
    : activeBannerUrl;
  const lessonRecord = nextLesson as
    | (LessonWithVersion & {
        cover_image?: string | null;
        banner_url?: string | null;
      })
    | undefined;
  const lessonContent = (nextLesson?.content || {}) as Record<string, unknown>;
  const activeModuleNumber =
    typeof lessonContent.moduleNumber === "number"
      ? lessonContent.moduleNumber
      : typeof nextLesson?.module_number === "number"
        ? nextLesson.module_number
        : null;
  const instructorLessonBanner =
    typeof lessonRecord?.cover_image === "string"
      ? lessonRecord.cover_image
      : typeof lessonRecord?.banner_url === "string"
        ? lessonRecord.banner_url
        : typeof nextLesson?.content?.coverImage === "string"
          ? nextLesson.content.coverImage
          : typeof nextLesson?.content?.bannerUrl === "string"
            ? nextLesson.content.bannerUrl
            : undefined;
  const nextLessonBannerPosition = normalizeBannerPosition(
    lessonContent.bannerPosition ?? lessonContent.banner_position,
  );
  const nextLessonBannerDimness = normalizeBannerDimness(
    lessonContent.bannerDimness ?? lessonContent.banner_dimness,
  );
  const avatarImage = isValidImageUrl(customAvatarUrl.trim())
    ? customAvatarUrl.trim()
    : "";
  const avatarRenderKey = `${avatarImage}:${badgeColor}:${profileInitials}`;
  const availableLessons = displayLessons.filter(
    (lesson) => lesson.id !== nextLesson?.id,
  );
  const getLessonHref = (lesson: LessonWithVersion, status: LessonStatus) => {
    const stepParam =
      status === "completed"
        ? "&step=7"
        : status === "pending-review"
          ? "&start=warm_up"
          : "";
    const lessonPath = lesson.content?.slug || lesson.slug || lesson.id;
    return `/lessons/${lessonPath}?${stepParam.replace(/^&/, "")}`.replace(
      /\?$/,
      "",
    );
  };
  const rememberLesson = (lessonId: string) =>
    writeLastAccessedLesson(lessonId, token);

  const uploadProfileImage = async (file: File | undefined, kind: "avatar" | "banner") => {
    if (!file) return;
    const maxSize = kind === "avatar" ? 2 * 1024 * 1024 : 5 * 1024 * 1024;
    if (file.size > maxSize) {
      setProfileImageStatus(`${kind === "avatar" ? "Avatar" : "Banner"} images must be ${kind === "avatar" ? "2" : "5"} MB or smaller.`);
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setProfileImageStatus("Choose a JPG, PNG, or WEBP image.");
      return;
    }

    const setUploading = kind === "avatar" ? setIsUploadingAvatar : setIsUploadingBanner;
    setUploading(true);
    setProfileImageStatus(`Uploading ${kind} image...`);
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) throw userError || new Error("Sign in to upload a profile image.");
      const extension = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
      const path = `student-customization/${userData.user.id}/${kind}-${crypto.randomUUID()}.${extension}`;
      const buckets = kind === "avatar"
        ? ["avatars", "student-resources", "lesson-assets"]
        : ["lesson-assets"];
      let publicUrl = "";
      let uploadError: Error | null = null;
      for (const bucket of buckets) {
        const { error } = await supabase.storage.from(bucket).upload(path, file, {
          cacheControl: "3600",
          contentType: file.type,
          upsert: false,
        });
        if (!error) {
          publicUrl = supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
          uploadError = null;
          break;
        }
        uploadError = error;
      }
      if (uploadError || !publicUrl) throw uploadError || new Error("The image could not be uploaded.");
      if (kind === "avatar") setCustomAvatarUrl(publicUrl);
      else {
        setCustomBannerUrl(publicUrl);
        setBannerLoadFailed(false);
      }
      setProfileImageStatus(`${kind === "avatar" ? "Avatar" : "Banner"} uploaded. Save settings to apply it.`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Check your connection and upload permissions.";
      setProfileImageStatus(`Upload failed: ${detail}`);
    } finally {
      setUploading(false);
      if (kind === "avatar" && avatarFileRef.current) avatarFileRef.current.value = "";
      if (kind === "banner" && bannerFileRef.current) bannerFileRef.current.value = "";
    }
  };

  const saveProfileCustomization = async () => {
    const nextAvatarColor = avatarColor;
    const avatarUrl = customAvatarUrl.trim();
    const initials = customizedInitials;
    setAvatarColor(nextAvatarColor);
    setAvatarInitials(initials);
    setCustomAvatarUrl(avatarUrl);
    setIsSavingProfileCustomization(true);
    setProfileImageStatus(null);
    setProfileSaveNotice(null);
    setProfileSaveError(null);
    const bannerUrl = customBannerUrl.trim();
    const preferences: ProfilePreferences = {
      avatarPreset,
      avatar_bg_color: nextAvatarColor,
      avatar_initials: initials,
      avatar_url: avatarUrl,
      custom_avatar_url: avatarUrl,
      customAvatarUrl: avatarUrl,
      bannerPreset,
      banner_url: bannerUrl,
      customBannerUrl: bannerUrl,
      bannerPosition,
      banner_position: bannerPosition,
      dashboardBannerDimness,
      dashboard_banner_dimness: dashboardBannerDimness,
    };
    const customization = {
      avatar_bg_color: nextAvatarColor,
      avatar_initials: initials,
      avatar_url: avatarUrl,
      custom_avatar_url: avatarUrl,
      banner_url: bannerUrl,
      banner_position: bannerPosition,
      dashboard_banner_dimness: dashboardBannerDimness,
    };
    try {
      window.localStorage.setItem("student_customization", JSON.stringify(customization));
      window.localStorage.setItem(`fluentia:profile:${token}`, JSON.stringify(preferences));
      const badgeIdentifiers = [...new Set([activeStudent.id, activeStudent.token, token].filter(Boolean))];
      for (const identifier of badgeIdentifiers) {
        window.localStorage.setItem(`student_badge_color:${identifier}`, nextAvatarColor);
        window.localStorage.setItem(`student_badge_initials:${identifier}`, initials);
      }
    } catch (error) {
      logDashboardError("Profile customization could not be cached locally:", error);
    }
    setActiveStudent((current) => current ? {
      ...current,
      profile: {
        ...current.profile,
        avatarUrl,
        bannerUrl,
        avatarBgColor: nextAvatarColor,
        avatarInitials: initials,
      },
    } : current);
    setCustomBannerUrl(bannerUrl);
    window.dispatchEvent(new Event("profile-updated"));
    window.dispatchEvent(new CustomEvent("fluentia:student-profile-updated", { detail: customization }));
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!userData.user) throw new Error("No authenticated user is available.");

      const { error: metadataError } = await supabase.auth.updateUser({
        data: {
          ...(userData.user.user_metadata || {}),
          avatar_bg_color: nextAvatarColor,
          avatar_initials: initials,
          avatar_url: avatarUrl,
          custom_avatar_url: avatarUrl,
          banner_url: bannerUrl,
          banner_position: bannerPosition,
          dashboard_banner_dimness: dashboardBannerDimness,
        },
      });
      if (metadataError) throw metadataError;

      const profileValues = {
        id: userData.user.id,
        token,
        full_name: displayName,
        role: "student",
        avatar_bg_color: nextAvatarColor,
        avatar_initials: initials,
        avatar_url: avatarUrl || null,
        banner_url: bannerUrl || null,
        updated_at: new Date().toISOString(),
      };
      let { error: profileError } = await supabase
        .from("profiles")
        .upsert(profileValues, { onConflict: "id" });
      if (profileError && (profileError.code === "42703" || profileError.code === "PGRST204")
        && /(avatar_bg_color|avatar_initials|avatar_url|banner_url)/i.test(profileError.message || "")) {
        console.warn("Profile customization columns unavailable; auth metadata was saved:", profileError);
        const { avatar_bg_color: _avatarBgColor, avatar_initials: _avatarInitials, avatar_url: _avatarUrl, banner_url: _bannerUrl, ...fallbackProfileValues } = profileValues;
        const fallback = await supabase
          .from("profiles")
          .upsert(fallbackProfileValues, { onConflict: "id" });
        profileError = fallback.error;
      }
      if (profileError) throw profileError;

      await saveStudentProfile(token, {
        ...activeStudent.profile,
        fullName: displayName,
        avatarUrl,
        bannerUrl,
        avatarBgColor: nextAvatarColor,
        avatarInitials: initials,
      });
      const { data: refreshedUser, error: refreshError } = await supabase.auth.getUser();
      if (refreshError) throw refreshError;
      if (refreshedUser.user) {
        const { data: refreshedProfile, error: refreshedProfileError } = await supabase
          .from("profiles")
          .select("avatar_bg_color, avatar_initials, avatar_url, banner_url")
          .eq("id", refreshedUser.user.id)
          .maybeSingle();
        if (refreshedProfileError && refreshedProfileError.code !== "42703" && refreshedProfileError.code !== "PGRST204") {
          throw refreshedProfileError;
        }
        const refreshedMetadata = refreshedUser.user.user_metadata as Record<string, unknown>;
        const refreshedAvatarColor = typeof refreshedProfile?.avatar_bg_color === "string"
          ? refreshedProfile.avatar_bg_color
          : typeof refreshedMetadata.avatar_bg_color === "string" ? refreshedMetadata.avatar_bg_color : nextAvatarColor;
        const nextInitials = typeof refreshedProfile?.avatar_initials === "string"
          ? refreshedProfile.avatar_initials
          : typeof refreshedMetadata.avatar_initials === "string" ? refreshedMetadata.avatar_initials : initials;
        const refreshedAvatarUrl = typeof refreshedProfile?.avatar_url === "string"
          ? refreshedProfile.avatar_url
          : typeof refreshedMetadata.custom_avatar_url === "string"
            ? refreshedMetadata.custom_avatar_url
            : typeof refreshedMetadata.avatar_url === "string" ? refreshedMetadata.avatar_url : avatarUrl;
        setAvatarColor(refreshedAvatarColor);
        setAvatarInitials(nextInitials);
        setCustomAvatarUrl(refreshedAvatarUrl);
        setActiveStudent((current) => current ? {
          ...current,
          profile: {
            ...current.profile,
            avatarBgColor: refreshedAvatarColor,
            avatarInitials: nextInitials,
            avatarUrl: refreshedAvatarUrl,
            bannerUrl: typeof refreshedProfile?.banner_url === "string" ? refreshedProfile.banner_url : bannerUrl,
          },
        } : current);
      }
      setAvatarColor(nextAvatarColor);
      setAvatarInitials(initials);
      setCustomAvatarUrl(avatarUrl);
      setActiveStudent((current) => current ? {
        ...current,
        profile: {
          ...current.profile,
          avatarBgColor: nextAvatarColor,
          avatarInitials: initials,
          avatarUrl,
          bannerUrl,
        },
      } : current);
      setBannerLoadFailed(false);
      setProfileSaveNotice("Profile customization saved successfully!");
      setProfileOpen(false);
    } catch (error) {
      console.error("Failed to save student profile customization:", error);
      const details = error && typeof error === "object" ? error as DashboardError : undefined;
      setProfileSaveError(details?.message || details?.details || (error instanceof Error ? error.message : String(error)));
    } finally {
      setIsSavingProfileCustomization(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#0c1017] text-[#e8e7e4] font-sans">
      {profileSaveNotice && <div role="status" className="fixed bottom-5 right-5 z-[100] flex items-center gap-3 rounded-md border border-emerald-500/30 bg-[#171d28] px-4 py-3 text-xs text-emerald-300 shadow-xl"><span>{profileSaveNotice}</span><button type="button" onClick={() => setProfileSaveNotice(null)} aria-label="Dismiss profile save notification" className="text-emerald-200/70 hover:text-emerald-100"><X className="h-4 w-4" /></button></div>}
      {profileSaveError && <div role="alert" className="fixed bottom-5 right-5 z-[100] flex items-center gap-3 rounded-md border border-red-500/40 bg-[#241719] px-4 py-3 text-xs text-red-200 shadow-xl"><span>{profileSaveError}</span><button type="button" onClick={() => setProfileSaveError(null)} aria-label="Dismiss profile save error" className="text-red-200/70 hover:text-red-100"><X className="h-4 w-4" /></button></div>}
      <div className="mx-auto max-w-7xl px-4 pt-6 md:px-6">
        <HeroBanner
          imageUrl={dashboardHeaderBanner}
          position={normalizeBannerPosition({ x: 50, y: bannerPosition })}
          dimness={dashboardBannerDimness}
          onImageError={() => setBannerLoadFailed(true)}
        >
            {profileOpen && (
              <button
                type="button"
                aria-label="Close student profile"
                onClick={() => setProfileOpen(false)}
                className="fixed inset-0 z-0 cursor-default bg-black/55"
              />
            )}
            <HeroBannerContent
              logo={<HeroBannerLogo />}
              badge={
                <span className="inline-flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/20 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-400 md:text-sm">
                  <UserRound className="h-3.5 w-3.5" />
                  {displayLessons.length} lessons available
                  <span aria-hidden="true">|</span> {studentLevel}
                </span>
              }
              title={
                <h1 className="font-sans text-3xl font-bold tracking-tight text-[#f1eee8] md:text-4xl lg:text-[36px]">
                  Welcome back, {displayName}.
                </h1>
              }
              subtitle={
                <p className="text-sm text-[#b5bac2] opacity-90 md:text-base">
                  Seven stages. One connected journey.
                </p>
              }
            />
            <div className="hidden" aria-label="Student profile">
              <button
                type="button"
                onClick={() => setProfileOpen((open) => !open)}
                aria-expanded={profileOpen}
                aria-controls="student-profile-flyout"
                style={
                  !avatarImage
                    ? { backgroundColor: badgeColor }
                    : undefined
                }
                className={`flex h-8 w-8 items-center justify-center overflow-hidden rounded-full text-xs  transition hover:ring-2 hover:ring-amber-500/40 ${avatarImage ? "bg-[#283344]" : selectedAvatar.className}`}
              >
                {avatarImage ? (
                  <img
                    src={avatarImage}
                    alt={`${displayName} avatar`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  profileInitials
                )}
              </button>
              <div className="hidden text-left sm:block">
                <p className="text-xs font-semibold text-stone-100">
                  {displayName}
                </p>
                <p className="text-[10px] text-stone-500">
                  {studentLevel}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setProfileOpen(true);
                  setProfileTab("profile");
                }}
                aria-label="Profile settings"
                title="Profile settings"
                className="text-stone-500 transition hover:text-amber-400"
              >
                <Settings2 className="h-4 w-4" />
              </button>
              {profileOpen && (
                <div
                  id="legacy-student-profile-flyout"
                  className="absolute right-0 top-12 z-50 flex max-h-[min(80vh,620px)] w-[min(22rem,calc(100vw-3rem))] flex-col overflow-hidden rounded-xl border border-[#394252] bg-[#171d28] text-left shadow-2xl"
                >
                  <div className="flex items-start justify-between gap-4 border-b border-[#29303c] p-4">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">
                        Student profile
                      </p>
                      <p className="mt-1 text-sm font-semibold text-stone-100">
                        {displayName}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setProfileOpen(false)}
                      aria-label="Close profile"
                      className="text-stone-500 hover:text-stone-200"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 border-b border-[#29303c] px-4 pt-3">
                    <button
                      type="button"
                      onClick={() => setProfileTab("profile")}
                      className={`border-b-2 pb-2 text-[10px]  uppercase tracking-[0.12em] ${profileTab === "profile" ? "border-amber-500/40 text-amber-400" : "border-transparent text-stone-500 hover:text-stone-300"}`}
                    >
                      Profile &amp; Preferences
                    </button>
                    <button
                      type="button"
                      onClick={() => setProfileTab("customization")}
                      className={`border-b-2 pb-2 text-[10px]  uppercase tracking-[0.12em] ${profileTab === "customization" ? "border-amber-500/40 text-amber-400" : "border-transparent text-stone-500 hover:text-stone-300"}`}
                    >
                      Customization
                    </button>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto p-4">
                    {profileTab === "profile" ? (
                      <div className="space-y-4 text-xs">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <p className="text-stone-500">Name</p>
                            <p className="mt-1 text-stone-200">{displayName}</p>
                          </div>
                          <div>
                            <p className="text-stone-500">Progress</p>
                            <p className="mt-1 text-stone-200">
                              {completedLessons} / {displayLessons.length}{" "}
                              lessons
                            </p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <p className="text-stone-500">Level</p>
                            <p className="mt-1 rounded-md border border-[#394252] bg-[#0c1017] p-2 text-stone-200">
                              {studentLevel}
                            </p>
                          </div>
                          <div>
                            <p className="text-stone-500">Learning goal</p>
                            <p className="mt-1 rounded-md border border-[#394252] bg-[#0c1017] p-2 text-stone-200">
                              {studentLearningGoal}
                            </p>
                          </div>
                        </div>
                        <div className="border-t border-[#29303c] pt-3">
                          <p className="text-stone-500">Assigned instructor</p>
                          <p className="mt-1 rounded-md border border-[#394252] bg-[#0c1017] p-2 text-stone-200">
                            {assignedInstructorName}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">
                            Student Avatar
                          </p>
                          <div className="mt-2 grid grid-cols-3 gap-2">
                            {AVATAR_PRESETS.map((preset) => (
                              <button
                                key={preset.id}
                                type="button"
                                onClick={() => {
                                  setAvatarPreset(preset.id);
                                  setAvatarColor(preset.backgroundColor);
                                  setCustomAvatarUrl("");
                                }}
                                aria-label={`Use ${preset.label} avatar`}
                                className={`flex flex-col items-center gap-1 rounded-md border p-2 text-[10px] text-stone-400 transition ${avatarPreset === preset.id && !avatarImage ? "border-amber-500/40 bg-amber-500/20 text-amber-400" : "border-[#394252] hover:border-amber-500/40"}`}
                              >
                                <span
                                  style={{
                                    backgroundColor: preset.backgroundColor,
                                  }}
                                  className={`flex h-8 w-8 items-center justify-center rounded-full text-[10px]  ${preset.className}`}
                                >
                                  {profileInitials}
                                </span>
                                {preset.label}
                              </button>
                            ))}
                          </div>
                          <div className="mt-3 flex items-center gap-2 rounded-md border border-[#29303c] bg-[#0c1017] p-2">
                            <span
                              style={
                                !avatarImage
                                  ? {
                                      backgroundColor: avatarColor,
                                    }
                                  : undefined
                              }
                              className={`flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-[10px] font-bold ${avatarImage ? "bg-[#283344]" : selectedAvatar.className}`}
                            >
                              {avatarImage ? (
                                <img
                                  src={avatarImage}
                                  alt="Custom avatar preview"
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                profileInitials
                              )}
                            </span>
                            <span className="text-xs text-stone-400">
                              Live avatar preview
                            </span>
                          </div>
                          <label className="mt-2 block text-xs text-stone-400">
                            Custom Avatar URL
                            <input
                              value={customAvatarUrl}
                              onChange={(event) =>
                                setCustomAvatarUrl(event.target.value)
                              }
                              placeholder="https://..."
                              className="mt-1 w-full rounded-md border border-[#394252] bg-[#0c1017] p-2 text-xs text-stone-200"
                            />
                          </label>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">
                            Dashboard Hero Banner
                          </p>
                          <div className="mt-2 grid grid-cols-3 gap-2">
                            {BANNER_PRESETS.map((preset) => (
                              <button
                                key={preset.id}
                                type="button"
                                onClick={() => {
                                  setBannerPreset(preset.id);
                                  setCustomBannerUrl("");
                                }}
                                className={`overflow-hidden rounded-md border text-left transition ${bannerPreset === preset.id && !customBannerUrl ? "border-amber-500/40" : "border-[#394252] hover:border-amber-500/40"}`}
                              >
                                <img
                                  src={preset.image}
                                  alt=""
                                  className="h-10 w-full object-cover opacity-75"
                                />
                                <span className="block truncate px-1.5 py-1 text-[9px] text-stone-400">
                                  {preset.label}
                                </span>
                              </button>
                            ))}
                          </div>
                          <label className="mt-2 block text-xs text-stone-400">
                            Custom Banner URL
                            <input
                              value={customBannerUrl}
                              onChange={(event) =>
                                setCustomBannerUrl(event.target.value)
                              }
                              placeholder="https://..."
                              className="mt-1 w-full rounded-md border border-[#394252] bg-[#0c1017] p-2 text-xs text-stone-200"
                            />
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="border-t border-[#29303c] bg-[#171d28] p-4">
                    <button
                      type="button"
                      onClick={() => void saveProfileCustomization()}
                      className="w-full rounded-md bg-amber-500/20 px-3 py-2 text-xs  text-amber-400 hover:bg-amber-500/20"
                    >
                      Save settings
                    </button>
                  </div>
                </div>
              )}
            </div>
        </HeroBanner>
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between py-4">
          <p className="text-[12px] text-[#aeb2b9]">
            Welcome back, <span className="text-[#e6e4e0]">{displayName}</span>.
          </p>
          <div className="ml-auto flex items-center gap-2">
            <Tooltip content="Open your Learning Hub, notes, and study resources">
            <button
              type="button"
              onClick={() => setSidebarOpen((open) => !open)}
              aria-expanded={sidebarOpen}
              aria-controls="learning-sidebar"
              className={`group h-8 px-3 flex items-center gap-2 rounded-lg bg-slate-800/80 border text-xs  transition-all cursor-pointer ${sidebarOpen ? "border-amber-500/40 text-amber-400" : "border-slate-700/60 text-slate-300 hover:border-amber-500/40 hover:text-amber-400 hover:bg-slate-800"}`}
            >
              <PanelRight
                className={`w-4 h-4 shrink-0 ${sidebarOpen ? "text-amber-400" : "text-slate-400 group-hover:text-amber-400"}`}
              />
              Learning Hub
            </button>
            </Tooltip>
            <Tooltip content="Look up a word in the dictionary">
              <button
                type="button"
                onClick={() => setDictionaryOpen(true)}
                aria-label="Open dictionary"
                className={`group flex h-8 w-8 items-center justify-center rounded-lg border bg-slate-800/80 transition-all cursor-pointer ${dictionaryOpen ? "border-amber-500/40 text-amber-400" : "border-slate-700/60 text-slate-300 hover:border-amber-500/40 hover:text-amber-400 hover:bg-slate-800"}`}
              >
                <BookOpen className={`h-4 w-4 shrink-0 ${dictionaryOpen ? "text-amber-400" : "text-slate-400 group-hover:text-amber-400"}`} />
              </button>
            </Tooltip>
            <Tooltip content="Display and appearance">
              <DisplaySettingsControl />
            </Tooltip>
          </div>
        </div>

        <div className="py-8">
          <section
            className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch border-b border-[#202631] py-6"
            aria-label="Student progress overview"
          >
            <div
              className="relative order-last flex h-full min-h-[104px] flex-col justify-center rounded-xl border border-[#202631] bg-[#121721] p-4"
              aria-label="Student profile"
            >
              <div className="flex items-center gap-3">
                <Tooltip content="Open your student profile">
                <button
                  type="button"
                  key={avatarRenderKey}
                  onClick={() => setProfileOpen((open) => !open)}
                  aria-expanded={profileOpen}
                  aria-controls="student-profile-flyout"
                  style={
                    !avatarImage
                      ? { backgroundColor: badgeColor }
                      : undefined
                  }
                  className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs  transition hover:ring-2 hover:ring-amber-500/40 ${avatarImage ? "bg-[#283344]" : selectedAvatar.className}`}
                >
                  {avatarImage ? (
                    <img
                      src={avatarImage}
                      alt={`${displayName} avatar`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    profileInitials
                  )}
                </button>
                </Tooltip>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-stone-100">
                    {displayName}
                  </p>
                  <p className="mt-1 truncate text-[10px] text-stone-500">
                    {studentLevel}
                  </p>
                </div>
                <Tooltip content="Edit profile and dashboard appearance">
                <button
                  type="button"
                  onClick={() => {
                    setProfileOpen(true);
                    setProfileTab("profile");
                  }}
                  aria-label="Profile settings"
                  className="text-stone-500 transition hover:text-amber-400"
                >
                  <Settings2 className="h-4 w-4" />
                </button>
                </Tooltip>
              </div>
              {profileOpen && (
                <div
                  id="student-profile-flyout"
                  className="absolute right-0 top-full z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-[#394252] bg-[#171d28] text-left shadow-2xl"
                >
                  <div className="flex items-center justify-between gap-3 border-b border-[#29303c] p-4">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">
                        Student profile
                      </p>
                      <p className="mt-1 text-sm font-semibold text-stone-100">
                        {displayName}
                      </p>
                    </div>
                    <Tooltip content="Close your student profile">
                    <button
                      type="button"
                      onClick={() => setProfileOpen(false)}
                      aria-label="Close profile"
                      className="text-stone-500 hover:text-stone-200"
                    >
                      <X className="h-4 w-4" />
                    </button>
                    </Tooltip>
                  </div>
                  <div className="grid grid-cols-2 border-b border-[#29303c] px-4 pt-3">
                    <Tooltip content="View your profile and learning preferences">
                    <button
                      type="button"
                      onClick={() => setProfileTab("profile")}
                      className={`border-b-2 pb-2 text-[10px]  uppercase tracking-[0.12em] ${profileTab === "profile" ? "border-amber-500/40 text-amber-400" : "border-transparent text-stone-500 hover:text-stone-300"}`}
                    >
                      Profile &amp; Preferences
                    </button>
                    </Tooltip>
                    <Tooltip content="Choose your dashboard appearance">
                    <button
                      type="button"
                      onClick={() => setProfileTab("customization")}
                      className={`border-b-2 pb-2 text-[10px]  uppercase tracking-[0.12em] ${profileTab === "customization" ? "border-amber-500/40 text-amber-400" : "border-transparent text-stone-500 hover:text-stone-300"}`}
                    >
                      Customization
                    </button>
                    </Tooltip>
                  </div>
                  <div className="space-y-4 p-4 text-xs">
                    {profileTab === "profile" ? (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <p className="text-stone-500">Name</p>
                            <p className="mt-1 text-stone-200">{displayName}</p>
                          </div>
                          <div>
                            <p className="text-stone-500">Progress</p>
                            <p className="mt-1 text-stone-200">
                              {completedLessons} / {displayLessons.length}{" "}
                              lessons
                            </p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <p className="text-stone-500">Level</p>
                            <p className="mt-1 rounded-md border border-[#394252] bg-[#0c1017] p-2 text-stone-200">
                              {studentLevel}
                            </p>
                          </div>
                          <div>
                            <p className="text-stone-500">Learning goal</p>
                            <p className="mt-1 rounded-md border border-[#394252] bg-[#0c1017] p-2 text-stone-200">
                              {studentLearningGoal}
                            </p>
                          </div>
                        </div>
                        <div className="border-t border-[#29303c] pt-3">
                          <p className="text-stone-500">Assigned instructor</p>
                          <p className="mt-1 rounded-md border border-[#394252] bg-[#0c1017] p-2 text-stone-200">
                            {assignedInstructorName}
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">
                            Avatar badge
                          </p>
                          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                            {AVATAR_PRESETS.map((preset) => (
                              <button
                                key={preset.id}
                                type="button"
                                onClick={() => {
                                  setAvatarPreset(preset.id);
                                  setAvatarColor(preset.backgroundColor);
                                  setCustomAvatarUrl("");
                                }}
                                aria-label={`Use ${preset.label} badge color`}
                                aria-pressed={avatarPreset === preset.id}
                                className={`flex items-center gap-2 rounded-md border px-2 py-2 text-left text-[10px] text-stone-300 ${avatarPreset === preset.id ? "border-amber-500/40" : "border-[#394252] hover:border-amber-500/40"}`}
                              >
                                <span className="h-4 w-4 shrink-0 rounded-full" style={{ backgroundColor: preset.backgroundColor }} />
                                <span className="truncate">{preset.label}</span>
                              </button>
                            ))}
                          </div>
                          <label className="mt-3 block text-stone-400">
                            Badge initials
                            <input
                              value={avatarInitials}
                              onChange={(event) => setAvatarInitials(event.target.value.replace(/[^a-z]/gi, "").slice(0, 3).toUpperCase())}
                              maxLength={3}
                              placeholder={defaultProfileInitials}
                              className="mt-1 w-full rounded-md border border-[#394252] bg-[#0c1017] p-2 text-xs uppercase text-stone-200"
                            />
                            <span className="mt-1 block text-[10px] text-stone-500">Leave blank to use your name initials.</span>
                          </label>
                          <div className="mt-3 flex items-center gap-3 rounded-md border border-[#29303c] bg-[#0c1017] p-2">
                            <span style={{ backgroundColor: avatarColor }} className={`flex h-10 w-10 items-center justify-center overflow-hidden rounded-full text-xs font-bold ${selectedAvatar.className}`}>
                              {visibleAvatarInitials}
                            </span>
                            <span className="text-xs text-stone-400">Live badge preview</span>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Custom avatar image</p>
                          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-[#394252] px-3 py-2 text-xs text-stone-300 hover:border-amber-500/40">
                            <Upload className="h-4 w-4" />{isUploadingAvatar ? "Uploading avatar..." : "Upload avatar image"}
                            <input ref={avatarFileRef} type="file" accept="image/jpeg,image/png,image/webp" disabled={isUploadingAvatar} onChange={(event) => void uploadProfileImage(event.target.files?.[0], "avatar")} className="sr-only" />
                          </label>
                          <p className="text-[10px] leading-relaxed text-stone-500">Recommended: 400×400 px (1:1). Max 2 MB. JPG, PNG, or WEBP.</p>
                          <label className="block text-xs text-stone-400">Or use an image URL
                            <input value={customAvatarUrl} onChange={(event) => setCustomAvatarUrl(event.target.value)} placeholder="https://..." className="mt-1 w-full rounded-md border border-[#394252] bg-[#0c1017] p-2 text-xs text-stone-200" />
                          </label>
                        </div>
                        <div className="space-y-2">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Custom banner image</p>
                          <div className="grid grid-cols-3 gap-2" aria-label="Preset banner gallery">
                            {BANNER_PRESETS.map((preset) => {
                              const isSelected = bannerPreset === preset.id
                                && (!customBannerUrl.trim() || customBannerUrl.trim() === preset.image);
                              return (
                                <button
                                  key={preset.id}
                                  type="button"
                                  onClick={() => {
                                    setBannerPreset(preset.id);
                                    setCustomBannerUrl(preset.image);
                                    setBannerLoadFailed(false);
                                  }}
                                  aria-label={`Use ${preset.label} banner`}
                                  aria-pressed={isSelected}
                                  className={`overflow-hidden rounded-md border transition ${isSelected ? "border-amber-500/40 ring-1 ring-amber-500/40" : "border-[#394252] hover:border-amber-500/40"}`}
                                >
                                  <img src={preset.image} alt="" className="h-12 w-full object-cover" />
                                  <span className="block truncate px-1.5 py-1 text-left text-[9px] text-stone-300">
                                    {preset.label}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                          <div className="relative aspect-video overflow-hidden rounded-md border border-[#29303c] bg-[#0c1017]">
                            <img
                              src={activeBannerUrl}
                              alt="Banner preview"
                              style={getBannerPositionStyles(normalizeBannerPosition({ x: 50, y: bannerPosition }))}
                              className="h-full w-full object-cover"
                            />
                            <div style={{ opacity: dashboardBannerDimness / 100 }} className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(12,16,23,.72),rgba(12,16,23,.24)),linear-gradient(0deg,rgba(12,16,23,.92),transparent_65%)]" />
                          </div>
                          <label className="block text-[10px] text-stone-400">
                            Vertical position <span className="float-right text-stone-500">{bannerPosition}%</span>
                            <input
                              type="range"
                              min="0"
                              max="100"
                              value={bannerPosition}
                              onChange={(event) => setBannerPosition(Number(event.target.value))}
                              aria-label="Banner vertical position"
                              className="mt-1 w-full accent-amber-500"
                            />
                          </label>
                          <label className="block text-[10px] text-stone-400">
                            Dashboard banner dimness <span className="float-right text-stone-500">{dashboardBannerDimness}%</span>
                            <input
                              type="range"
                              min="0"
                              max="100"
                              value={dashboardBannerDimness}
                              onChange={(event) => setDashboardBannerDimness(Number(event.target.value))}
                              aria-label="Dashboard banner dimness"
                              className="mt-1 w-full accent-amber-500"
                            />
                          </label>
                          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-[#394252] px-3 py-2 text-xs text-stone-300 hover:border-amber-500/40">
                            <Upload className="h-4 w-4" />{isUploadingBanner ? "Uploading banner..." : "Upload banner image"}
                            <input ref={bannerFileRef} type="file" accept="image/jpeg,image/png,image/webp" disabled={isUploadingBanner} onChange={(event) => void uploadProfileImage(event.target.files?.[0], "banner")} className="sr-only" />
                          </label>
                          <p className="text-[10px] leading-relaxed text-stone-500">Recommended: 1200×300 px (4:1). Max 5 MB. JPG, PNG, or WEBP.</p>
                          <label className="block text-xs text-stone-400">Or use an image URL
                            <input value={customBannerUrl} onChange={(event) => setCustomBannerUrl(event.target.value)} placeholder="https://..." className="mt-1 w-full rounded-md border border-[#394252] bg-[#0c1017] p-2 text-xs text-stone-200" />
                          </label>
                        </div>
                        {profileImageStatus && <p role="status" className="rounded-md border border-amber-500/40 bg-amber-500/20 p-2 text-[10px] text-amber-400">{profileImageStatus}</p>}
                      </>
                    )}
                  </div>
                  <div className="border-t border-[#29303c] bg-[#171d28] p-4">
                    <Tooltip content="Save your profile and appearance settings">
                    <button
                      type="button"
                      onClick={() => void saveProfileCustomization()}
                      disabled={isSavingProfileCustomization || isUploadingAvatar || isUploadingBanner}
                      className="w-full rounded-md bg-amber-500/20 px-3 py-2 text-xs  text-amber-400 hover:bg-amber-500/20 disabled:cursor-wait disabled:opacity-60"
                    >
                      {isSavingProfileCustomization ? "Saving..." : "Save settings"}
                    </button>
                    </Tooltip>
                  </div>
                </div>
              )}
            </div>
            <Tooltip content={`${completedLessons} of ${displayLessons.length} available lessons are complete`}>
            <div className="flex h-full min-h-[104px] w-full flex-col justify-center rounded-xl border border-[#202631] bg-[#121721] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#667084]">
                Lessons Completed
              </p>
              <p className="mt-2 text-xl font-semibold text-stone-100">
                {completedLessons}{" "}
                <span className="text-sm font-normal text-stone-500">
                  / {displayLessons.length}
                </span>
              </p>
            </div>
            </Tooltip>
            <Tooltip content={hasFeedback ? "Your latest evaluation feedback is available" : "Your instructor has not published evaluation feedback yet"}>
            <div className="flex h-full min-h-[104px] w-full flex-col justify-center rounded-xl border border-[#202631] bg-[#121721] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#667084]">
                Overall Evaluation Status
              </p>
              <p
                className={`mt-2 flex items-center gap-2 text-sm font-semibold ${hasFeedback ? "text-emerald-300" : "text-amber-400"}`}
              >
                {hasFeedback ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <Clock3 className="h-4 w-4" />
                )}
                {hasFeedback
                  ? "Feedback Ready"
                  : hasPendingReview
                    ? "Pending Evaluation"
                    : "Pending Evaluation"}
              </p>
            </div>
            </Tooltip>
          </section>

          <section
            className="mt-6 rounded-xl border border-amber-500/40 bg-[#121721] p-5"
            aria-label="Instructor note"
          >
            <div className="flex items-start gap-3">
              <MessageSquareText className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">
                  A note from your instructor
                </p>
                <p className="mt-2 text-sm leading-relaxed text-stone-300">
                  {instructorNote}
                </p>
              </div>
            </div>
          </section>

          <section
            className="mt-6 rounded-xl border border-[#202631] bg-[#121721] p-5"
            aria-label="My Vocabulary and Flashcards"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2 text-amber-400">
                  <Layers3 className="h-4 w-4" />
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em]">
                    My Vocabulary &amp; Flashcards
                  </p>
                </div>
                <p className="mt-2 text-sm text-stone-400">
                  Review saved words between lessons.
                </p>
              </div>
              {displayLessons[0] && (
                <Tooltip content="Open the Study Room to review your saved vocabulary">
                <Link
                  href={getLessonHref(
                    displayLessons[0],
                    getLessonStatus(lessonStates[displayLessons[0].id]),
                  )}
                  onClick={() => rememberLesson(displayLessons[0].id)}
                  className="text-xs font-semibold text-amber-400 hover:text-amber-400"
                >
                  Open Study Room
                </Link>
                </Tooltip>
              )}
            </div>
            {currentCard ? (
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Tooltip content={showDefinition ? "Show the vocabulary word" : "Reveal the word definition"}>
                <button
                  type="button"
                  onClick={() => setShowDefinition((shown) => !shown)}
                  className="flex min-h-24 flex-1 items-center justify-center rounded-lg border border-amber-500/40 bg-[#0c1017] p-4 text-center transition hover:border-amber-500/40"
                >
                  <span className="font-sans text-2xl text-stone-100">
                    {showDefinition ? currentCard.definition : currentCard.word}
                  </span>
                </button>
                </Tooltip>
                <div className="flex items-center justify-between gap-4 sm:w-36 sm:flex-col">
                  <span className="text-xs text-stone-500">
                    {cardIndex + 1} / {savedWords.length} cards
                  </span>
                  <Tooltip content="Move to the next saved vocabulary card">
                  <button
                    type="button"
                    onClick={() => {
                      setCardIndex((index) => (index + 1) % savedWords.length);
                      setShowDefinition(false);
                    }}
                    className="text-xs  text-amber-400 hover:text-amber-400"
                  >
                    Next card
                  </button>
                  </Tooltip>
                </div>
              </div>
            ) : (
              <p className="mt-4 rounded-lg border border-dashed border-[#394252] p-4 text-sm text-stone-500">
                Save words in the Study Room dictionary to build your first
                deck.
              </p>
            )}
          </section>

          {nextLesson && (
            <section className="mt-6" aria-label="Continue learning">
              <article className="group relative h-64 w-full overflow-hidden rounded-xl border border-[#202631] bg-[#121721] transition-colors duration-300 hover:border-amber-500/40">
                <img
                  src={instructorLessonBanner || BANNER_PRESETS[0].image}
                  alt=""
                  style={getBannerPositionStyles(nextLessonBannerPosition)}
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <div style={{ opacity: nextLessonBannerDimness / 100 }} className="absolute inset-0 bg-[linear-gradient(90deg,rgba(12,16,23,.72),rgba(12,16,23,.24)),linear-gradient(0deg,rgba(12,16,23,.92),transparent_65%)]" />
                <span className="absolute left-5 top-4 z-10 rounded-md px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-amber-400 bg-amber-500/20 border border-amber-500/40">
                  Module {activeModuleNumber ?? 1}
                </span>
                <div className="relative flex h-full flex-col justify-end p-5 md:p-7">
                  <div className="max-w-3xl pr-28 md:pr-36">
                    <div className="flex items-center gap-2 text-amber-400">
                      <BookOpen className="h-4 w-4" />
                      <span className="text-[10px] font-semibold uppercase tracking-[0.14em]">
                        Lesson
                      </span>
                    </div>
                    <h2 className="mt-2 font-sans text-2xl font-semibold text-stone-100 md:text-3xl">
                      {nextLesson.title}
                    </h2>
                    <p className="mt-2 max-w-2xl text-sm text-stone-300">
                      {nextLesson.content?.subtitle ||
                        "Continue your personalized language practice."}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {nextLessonStatus && (
                        <span className={`rounded-sm border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] ${
                          nextLessonStatus === "in-progress"
                            ? "border-sky-500/30 bg-sky-500/10 text-sky-300"
                            : "border-[#394252] bg-[#171d28]/80 text-stone-400"
                        }`}>
                          {getLessonStatusCopy(nextLessonStatus)}
                        </span>
                      )}
                      <p className="flex items-center gap-2 text-[11px] text-stone-500">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#283344] text-[8px] font-semibold text-amber-400">
                          {nextLesson.content?.instructor?.initials ||
                            assignedInstructorInitials}
                        </span>{" "}
                        Guided by{" "}
                        {nextLesson.content?.instructor?.fullName ||
                          assignedInstructorName}
                      </p>
                    </div>
                  </div>
                  <div className="absolute bottom-5 right-5 flex items-end justify-end md:bottom-7 md:right-7">
                    <Tooltip content={`Continue to ${nextLesson.title}.`}>
                      <Link
                        href={getLessonHref(nextLesson, nextLessonStatus || "not-started")}
                        onClick={() => rememberLesson(nextLesson.id)}
                        className="inline-flex w-fit items-center rounded-md bg-amber-500/20 px-3 py-2 text-xs font-normal text-amber-400 transition-colors hover:bg-amber-500/20"
                      >
                        {nextLessonStatus === "in-progress" ? "Continue Lesson" : "Start Lesson"}
                        <span className="ml-2" aria-hidden="true">-&gt;</span>
                      </Link>
                    </Tooltip>
                  </div>
                </div>
              </article>
            </section>
          )}

          {!nextLesson && (
            <section className="mt-6" aria-label="Continue learning">
              <div className="flex h-64 flex-col justify-center rounded-xl border border-[#202631] bg-[#121721] p-5 md:p-7">
                <div className="flex items-center gap-2 text-amber-400">
                  <Flame className="h-4 w-4" />
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em]">
                    Continue Learning / Next Up
                  </span>
                </div>
                <h2 className="mt-2 font-sans text-2xl font-semibold text-stone-100 md:text-3xl">
                  No active lesson assigned
                </h2>
                <p className="mt-2 text-sm text-stone-400">
                  Your instructor will publish a lesson here when it is ready.
                </p>
              </div>
            </section>
          )}

          {latestReport?.published && (
            <section
              className="mt-6 rounded-xl border border-[#202631] bg-[#121721] p-5"
              aria-label="Latest analytical report"
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">
                Latest Analytical Report
              </p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold text-stone-300">
                    Strengths
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-stone-400">
                    {latestReport.strengths || "No strengths recorded yet."}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-stone-300">
                    Areas to Improve
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-stone-400">
                    {latestReport.areasToImprove ||
                      "No improvement areas recorded yet."}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-stone-300">
                    Study Hub Prescription
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-amber-400">
                    {latestReport.studyHubPrescription ||
                      "No prescription recorded yet."}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-stone-300">
                    Voice Feedback
                  </p>
                  {latestReport.voiceFeedbackUrl ? (
                    <Tooltip content="Open your instructor's voice feedback">
                    <a
                      href={latestReport.voiceFeedbackUrl}
                      className="mt-1 block w-full truncate text-sm text-amber-400 hover:text-amber-400"
                    >
                      {latestReport.voiceFeedbackUrl}
                    </a>
                    </Tooltip>
                  ) : (
                    <p className="mt-1 text-sm text-stone-400">
                      No voice feedback attached.
                    </p>
                  )}
                </div>
              </div>
            </section>
          )}

          <section className="pt-8" aria-label="Previous lessons">
            {availableLessons.length > 0 && (
              <h2 className="mb-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#667084]">
                Previous lessons
              </h2>
            )}
            <div className="grid gap-5 md:grid-cols-2">
              {availableLessons.length === 0 ? (
                <p className="col-span-full rounded-xl border border-dashed border-[#202631] bg-[#121721] p-6 text-center text-sm text-stone-500">
                  No previous lessons yet. Your instructor will assign more
                  lessons here.
                </p>
              ) : (
                availableLessons.map((lesson) => {
                  const status = getLessonStatus(lessonStates[lesson.id]);
                  const lessonBannerPosition = normalizeBannerPosition(
                    lesson.content?.bannerPosition ?? lesson.content?.banner_position,
                  );
                  const lessonBannerDimness = normalizeBannerDimness(
                    lesson.content?.bannerDimness ?? lesson.content?.banner_dimness,
                  );
                  const statusCopy = getLessonStatusCopy(status);
                  const ctaCopy =
                    status === "completed"
                      ? "View Results & Feedback"
                      : status === "pending-review"
                        ? "Submitted - Pending Evaluation"
                        : status === "in-progress"
                          ? "Continue Lesson"
                          : "Start Lesson";
                  return (
                    <article
                      key={lesson.id}
                      className="group flex flex-col overflow-hidden rounded-xl border border-[#202631] bg-[#121721] transition-colors duration-300 hover:border-amber-500/40"
                    >
                      <div className="relative h-44 overflow-hidden border-b border-[#202631]">
                        <img
                          src={
                            (typeof lesson.content?.coverImage === "string"
                              ? lesson.content.coverImage
                              : typeof lesson.content?.bannerUrl === "string"
                                ? lesson.content.bannerUrl
                                : undefined) || BANNER_PRESETS[0].image
                          }
                          alt=""
                          style={getBannerPositionStyles(lessonBannerPosition)}
                          className="h-full w-full object-cover"
                        />
                        <div style={{ opacity: lessonBannerDimness / 100 }} className="absolute inset-0 bg-[linear-gradient(90deg,rgba(12,16,23,.72),rgba(12,16,23,.24)),linear-gradient(0deg,rgba(12,16,23,.92),transparent_65%)]" />
                        <span className="absolute bottom-4 left-5 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-amber-400 bg-amber-500/20 border border-amber-500/40 rounded-md">
                          Module {lesson.content?.moduleNumber || 1}
                        </span>
                      </div>
                      <div className="flex flex-1 flex-col p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-center gap-2 text-amber-400">
                            <BookOpen className="h-4 w-4" />
                            <span className="text-[10px] font-semibold uppercase tracking-[0.14em]">
                              Lesson
                            </span>
                          </div>
                          <Tooltip content={`Lesson status: ${statusCopy.toLowerCase()}`}>
                          <span
                            className={`rounded-sm border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] ${
                              status === "completed"
                                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                                : status === "pending-review"
                                  ? "border-amber-500/40 bg-amber-500/20 text-amber-400"
                                  : status === "in-progress"
                                    ? "border-sky-500/30 bg-sky-500/10 text-sky-300"
                                    : "border-[#394252] bg-[#171d28] text-stone-400"
                            }`}
                          >
                            {statusCopy}
                          </span>
                          </Tooltip>
                        </div>
                        <div>
                          <h2 className="mt-2 font-sans text-xl font-semibold text-stone-100">
                            {lesson.title}
                          </h2>
                          <p className="mt-2 text-sm leading-relaxed text-stone-400">
                            {lesson.content?.subtitle ||
                              "Continue your personalized language practice."}
                          </p>
                          <p className="mt-3 flex items-center gap-2 text-[11px] text-stone-500">
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#283344] text-[8px] font-semibold text-amber-400">
                              {lesson.content?.instructor?.initials ||
                                assignedInstructorInitials}
                            </span>{" "}
                            Guided by{" "}
                            {lesson.content?.instructor?.fullName ||
                              assignedInstructorName}
                          </p>
                        </div>
                        {status === "completed" &&
                          lessonStates[lesson.id]?.evaluation?.published && (
                            <details className="mt-5 border-t border-[#202631] pt-4">
                              <Tooltip content="Expand the evaluation scores and instructor feedback">
                              <summary className="cursor-pointer text-xs font-semibold text-amber-400 hover:text-amber-400">
                                View analytical report
                              </summary>
                              </Tooltip>
                              <div className="mt-4 grid gap-3 text-sm text-stone-400 sm:grid-cols-2">
                                <div>
                                  <p className="text-xs font-semibold text-stone-300">
                                    Rubrics
                                  </p>
                                  <p className="mt-1 text-amber-400">
                                    {Object.entries(
                                      lessonStates[lesson.id]?.evaluation
                                        ?.scores || {},
                                    )
                                      .map(
                                        ([criterion, score]) =>
                                          `${criterion}: ${score}`,
                                      )
                                      .join(" | ") ||
                                      "No rubric scores recorded."}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs font-semibold text-stone-300">
                                    Strengths
                                  </p>
                                  <p className="mt-1 whitespace-pre-wrap">
                                    {lessonStates[lesson.id]?.evaluation
                                      ?.strengths || "No strengths recorded."}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs font-semibold text-stone-300">
                                    Areas to Improve
                                  </p>
                                  <p className="mt-1 whitespace-pre-wrap">
                                    {lessonStates[lesson.id]?.evaluation
                                      ?.areasToImprove ||
                                      "No improvement areas recorded."}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs font-semibold text-stone-300">
                                    Feedback
                                  </p>
                                  <p className="mt-1 whitespace-pre-wrap">
                                    {lessonStates[lesson.id]?.evaluation
                                      ?.comments || "No comments recorded."}
                                  </p>
                                </div>
                              </div>
                            </details>
                          )}
                        <div className="mt-auto flex justify-end pt-5">
                          <Tooltip content={`${ctaCopy}: ${lesson.title}`}>
                            <Link
                              href={getLessonHref(lesson, status)}
                              onClick={() => rememberLesson(lesson.id)}
                              className={`inline-flex rounded-md px-3 py-2 text-xs transition-colors ${
                                status === "completed"
                                  ? "bg-emerald-500 text-amber-400"
                                  : "bg-amber-500/20 text-amber-400 group-hover:bg-amber-500/20"
                              }`}
                            >
                              {ctaCopy}
                            </Link>
                          </Tooltip>
                        </div>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>
        </div>
      </div>
      <LearningSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        words={savedWords}
        notes={notes}
        studentId={activeStudent.id}
        studentToken={token}
        activeLessonId={nextLesson?.id}
        resource={latestReport?.studyHubPrescription}
        resources={dashboardResources}
        onSaveNote={(note) => {
          setNotes([note, ...notes.filter((item) => item.id !== note.id)]);
          void saveStudentNote(token, note);
        }}
        onRemoveWord={(word) => {
          setSavedWords(
            savedWords.filter(
              (item) => item.word.toLowerCase() !== word.toLowerCase(),
            ),
          );
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
      {(dictionaryOpen || dictionaryWord !== null) && (
        <DictionaryModal
          initialWord={dictionaryWord || ""}
          savedWords={savedWords}
          onClose={() => {
            setDictionaryOpen(false);
            setDictionaryWord(null);
          }}
          onSave={(word) => {
            setSavedWords([
              word,
              ...savedWords.filter(
                (item) => item.word.toLowerCase() !== word.word.toLowerCase(),
              ),
            ]);
            void saveVocabularyWord(token, word).catch(() => {});
          }}
        />
      )}
    </main>
  );
}

export default function DashboardPage() {
  return <DashboardContent />;
}
