"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CheckCircle2,
  Clock3,
  Crown,
  Flame,
  Folder,
  GripVertical,
  Home,
  Layers3,
  LayoutGrid,
  List,
  MessageSquareText,
  PanelRight,
  Award,
  Shield,
  Sparkles,
  Star,
  Settings,
  Upload,
  UserRound,
  WalletCards,
  X,
  type LucideIcon,
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
import { DisplaySettingsPanel } from "@/components/shared/display-settings";
import { AccessCard } from "@/components/access/access-card";
import {
  getStudentProfile,
  getStudentProfileNote,
  saveStudentProfile,
} from "@/lib/student-profiles";
import { getAuthenticatedUser } from "@/lib/identity";
import { uploadAsset } from "@/services/asset-service";
import { DEFAULT_BANNER_IMAGE_URL, getBannerOverlayStyles, getBannerPositionStyles, getFirstNonEmptyBannerUrl, normalizeBannerDimness, normalizeBannerPosition, type BannerFocalPosition } from "@/lib/banner-position";
import { HeroBanner, HeroBannerContent, HeroBannerLogo } from "@/components/shared/hero-banner";
import { BannerPositionControls } from "@/components/shared/banner-position-controls";
import { DEFAULT_MEMBERSHIP_TIER, MEMBERSHIP_BADGE_LABELS, MEMBERSHIP_TIERS, isMembershipTier, type MembershipTier } from "@/types/membership";

const MEMBERSHIP_TIER_DETAILS: Record<MembershipTier, { description: string; Icon: LucideIcon }> = {
  Associate: {
    description: "Foundational academic tier focused on core language mastery and guided evaluations.",
    Icon: Shield,
  },
  Fellowship: {
    description: "Advanced scholarly tier dedicated to rigorous discourse, complex syntax, and independent fluency.",
    Icon: BookOpen,
  },
  Mastery: {
    description: "Elite professional standing representing near-native fluency, polished articulation, and academic excellence.",
    Icon: Crown,
  },
  Executive: {
    description: "Specialized tier tailored for high-level professional communication, business negotiation, and rhetoric.",
    Icon: Sparkles,
  },
  "Honorary Fellow": {
    description: "Distinguished academic status conferred for exceptional dedication, contribution, and scholarly milestones.",
    Icon: Award,
  },
  "Honorary Guest": {
    description: "Privileged visiting status designed for special scholars, collaborative partners, and guest researchers.",
    Icon: Star,
  },
};

type LessonStatus =
  | "not-started"
  | "in-progress"
  | "pending-review"
  | "completed";

type LessonCardViewMode = "grid" | "list";

interface LessonCardPreferences {
  order: string[];
  viewMode: LessonCardViewMode;
}

function getLessonCardPreferencesKey(studentToken: string) {
  return `fluentia:dashboard:lesson-cards:${studentToken}`;
}

const AVATAR_PRESETS = Object.values({
  amber: {
    id: "amber",
    label: "Amber",
    backgroundColor: "#F59E0B",
    className: "text-white",
  },
  indigo: {
    id: "indigo",
    label: "Indigo",
    backgroundColor: "#5053C3",
    className: "text-white",
  },
  emerald: {
    id: "emerald",
    label: "Emerald",
    backgroundColor: "#1F7F5B",
    className: "text-white",
  },
  crimson: {
    id: "crimson",
    label: "Rose",
    backgroundColor: "#B23838",
    className: "text-white",
  },
} as const);

function resolveAvatarColor(color: string, presetId?: ProfilePreferences["avatarPreset"]) {
  const preset = AVATAR_PRESETS.find((option) => option.id === presetId);
  if (preset) return preset.backgroundColor;

  const normalizedColor = color.trim().toLowerCase();
  if (["#6366f1", "#818cf8"].includes(normalizedColor)) return "#5053C3";
  if (["#34d399", "#059669", "#36b37e"].includes(normalizedColor)) return "#1F7F5B";
  if (normalizedColor === "#a65368") return "#B23838";
  return color;
}

const BANNER_PRESETS = [
  {
    id: "default-dark",
    label: "Default",
    image: DEFAULT_BANNER_IMAGE_URL,
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

const WALLET_REMINDER_THRESHOLD = 35;

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
  bannerPosition?: BannerFocalPosition | number;
  banner_position?: BannerFocalPosition | number;
  bannerDimness?: number;
  banner_dimness?: number;
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
  const [lessonCardOrder, setLessonCardOrder] = useState<string[]>([]);
  const [lessonCardViewMode, setLessonCardViewMode] = useState<LessonCardViewMode>("grid");
  const [lessonCardPreferencesLoaded, setLessonCardPreferencesLoaded] = useState(false);
  const [draggedLessonId, setDraggedLessonId] = useState<string | null>(null);
  const [collapsedTrackIds, setCollapsedTrackIds] = useState<Set<string>>(() => new Set());
  const [lessonStates, setLessonStates] = useState<
    Record<string, PublishedLessonState | null>
  >({});
  const [savedWords, setSavedWords] = useState<SavedVocabularyWord[]>([]);
  const [cardIndex, setCardIndex] = useState(0);
  const [showDefinition, setShowDefinition] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dictionaryOpen, setDictionaryOpen] = useState(false);
  const [membershipModalOpen, setMembershipModalOpen] = useState(false);
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [notes, setNotes] = useState<StudentNote[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileSidebarRef = useRef<HTMLElement | null>(null);
  const [showUnreadFeedbackModal, setShowUnreadFeedbackModal] = useState(false);
  const [profileTab, setProfileTab] = useState<"profile" | "customization" | "display">(
    "profile",
  );
  useEffect(() => {
    if (!membershipModalOpen && !walletModalOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMembershipModalOpen(false);
        setWalletModalOpen(false);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [membershipModalOpen, walletModalOpen]);
  useEffect(() => {
    if (!profileOpen) return;
    const closeSidebarOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !profileSidebarRef.current?.contains(event.target)) {
        setProfileOpen(false);
      }
    };
    const closeSidebarOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setProfileOpen(false);
    };
    document.addEventListener("pointerdown", closeSidebarOnOutsidePointer);
    document.addEventListener("keydown", closeSidebarOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeSidebarOnOutsidePointer);
      document.removeEventListener("keydown", closeSidebarOnEscape);
    };
  }, [profileOpen]);
  const [avatarPreset, setAvatarPreset] =
    useState<ProfilePreferences["avatarPreset"]>("amber");
  const [avatarColor, setAvatarColor] = useState<string>(AVATAR_PRESETS[0].backgroundColor);
  const [avatarInitials, setAvatarInitials] = useState("");
  const [customAvatarUrl, setCustomAvatarUrl] = useState("");
  const [bannerPreset, setBannerPreset] =
    useState<ProfilePreferences["bannerPreset"]>("default-dark");
  const [customBannerUrl, setCustomBannerUrl] = useState("");
  const [bannerPosition, setBannerPosition] = useState<BannerFocalPosition>({ x: 50, y: 50 });
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
  const [dictionaryAnchor, setDictionaryAnchor] = useState<{ top: number; right: number; bottom: number; left: number } | null>(null);

  useEffect(() => {
    const studentToken = activeStudent?.token;
    if (!studentToken) {
      setLessonCardPreferencesLoaded(false);
      setLessonCardOrder([]);
      setLessonCardViewMode("grid");
      return;
    }

    setLessonCardPreferencesLoaded(false);
    try {
      const stored = window.localStorage.getItem(getLessonCardPreferencesKey(studentToken));
      if (stored) {
        const preferences: unknown = JSON.parse(stored);
        if (preferences && typeof preferences === "object") {
          const record = preferences as Partial<LessonCardPreferences>;
          setLessonCardOrder(Array.isArray(record.order)
            ? record.order.filter((id): id is string => typeof id === "string")
            : []);
          setLessonCardViewMode(record.viewMode === "list" ? "list" : "grid");
        } else {
          setLessonCardOrder([]);
          setLessonCardViewMode("grid");
        }
      } else {
        setLessonCardOrder([]);
        setLessonCardViewMode("grid");
      }
    } catch (error) {
      console.warn("Unable to load lesson card preferences:", error);
      setLessonCardOrder([]);
      setLessonCardViewMode("grid");
    } finally {
      setLessonCardPreferencesLoaded(true);
    }
  }, [activeStudent?.token]);

  useEffect(() => {
    function onDblClick(e: MouseEvent) {
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, button, a, [role=dialog]")) return;
      const selection = window.getSelection();
      const sel = selection?.toString().trim() || "";
      const w = sel.match(/^[a-zA-Z]+(?:[-'][a-zA-Z]+)*$/)?.[0];
      if (w && w.length > 1) {
        const rect = selection?.rangeCount ? selection.getRangeAt(0).getBoundingClientRect() : null;
        setDictionaryAnchor(rect ? { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left } : null);
        setDictionaryWord(w);
      }
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
        if (color) {
          const resolvedColor = resolveAvatarColor(color);
          const preset = AVATAR_PRESETS.find((option) => option.backgroundColor === resolvedColor);
          if (preset) setAvatarPreset(preset.id);
          setAvatarColor(resolvedColor);
        }
        setAvatarInitials((customization.avatar_initials || "").replace(/[^a-z0-9]/gi, "").slice(0, 3).toUpperCase());
        const avatarUrl = typeof customization.custom_avatar_url === "string"
          ? customization.custom_avatar_url
          : customization.avatar_url || "";
        setCustomAvatarUrl(avatarUrl);
        setCustomBannerUrl(customization.banner_url || "");
        setBannerPosition(normalizeBannerPosition(customization.bannerPosition ?? customization.banner_position));
        setDashboardBannerDimness(normalizeBannerDimness(customization.bannerDimness ?? customization.banner_dimness ?? customization.dashboard_banner_dimness ?? customization.dashboardBannerDimness));
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
        logDashboardError("Student profile could not be loaded from PostgreSQL:", error);
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
          const resolvedColor = resolveAvatarColor(color);
          setAvatarColor(resolvedColor);
          const preset = AVATAR_PRESETS.find((option) => option.backgroundColor === resolvedColor);
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
        const storedColor = profile.avatarBgColor || localPreferences.avatar_bg_color || localCustomization.avatar_bg_color || AVATAR_PRESETS[0].backgroundColor;
        const savedColor = resolveAvatarColor(storedColor, localPreferences.avatarPreset);
        setAvatarColor(savedColor);
        const savedPreset = AVATAR_PRESETS.find((preset) => preset.backgroundColor === savedColor);
        setAvatarPreset(savedPreset?.id || localPreferences.avatarPreset || "amber");
        const savedInitials = profile.avatarInitials ?? localPreferences.avatar_initials ?? localCustomization.avatar_initials ?? "";
        setAvatarInitials(savedInitials.replace(/[^a-z]/gi, "").slice(0, 3).toUpperCase());
        setCustomAvatarUrl(profile.avatarUrl || localPreferences.customAvatarUrl || localPreferences.avatar_url || localCustomization.custom_avatar_url || localCustomization.avatar_url || "");
        setCustomBannerUrl(profile.bannerUrl || localPreferences.customBannerUrl || localPreferences.banner_url || localCustomization.banner_url || "");
        setBannerPreset(localPreferences.bannerPreset || "default-dark");
        const savedBannerPosition = localPreferences.bannerPosition ?? localPreferences.banner_position ?? localCustomization.bannerPosition ?? localCustomization.banner_position;
        setBannerPosition(normalizeBannerPosition(savedBannerPosition));
        setDashboardBannerDimness(normalizeBannerDimness(
          localPreferences.bannerDimness ?? localPreferences.banner_dimness
            ?? localPreferences.dashboardBannerDimness ?? localPreferences.dashboard_banner_dimness
            ?? localCustomization.bannerDimness ?? localCustomization.banner_dimness
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
            [lesson.id, await fetchLessonState(lesson.id, userId, "summary")] as const,
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
        const user = await getAuthenticatedUser();
        if (!user) {
          logDashboardError(
            "Dashboard client session lookup failed after server authentication:",
            new Error("No authenticated user was returned"),
          );
          setAccessDenied(true);
          setIsMounted(true);
          return;
        }

        if (user.role === "instructor" || user.role === "admin") {
          router.replace("/instructor");
          return;
        }
        if (user.role !== "student") {
          setAccessDenied(true);
          setIsMounted(true);
          return;
        }

        const userEmail = user.email.trim().toLowerCase();
        let studentProfile: Partial<StudentUser["profile"]> | null = null;
        try {
          studentProfile = await getStudentProfile(user.id);
        } catch (error) {
          logDashboardError("Dashboard student lookup failed:", error);
        }

        const resolvedStudentId = user.id;
        const fallbackName = studentProfile?.fullName || user.name || userEmail || "Student";
        const userMetadata: Record<string, unknown> = {};
        const roleProfile = {
          role: user.role,
          avatar_bg_color: studentProfile?.avatarBgColor,
          avatar_initials: studentProfile?.avatarInitials,
          avatar_url: studentProfile?.avatarUrl,
          banner_url: studentProfile?.bannerUrl,
        };

        const active: StudentUser = {
          id: resolvedStudentId,
          token: resolvedStudentId,
          name: fallbackName,
          email: studentProfile?.email || userEmail || undefined,
          role: "student",
          profile: {
            id: resolvedStudentId,
            fullName: fallbackName,
            level: studentProfile?.level || "",
            targetGoal: studentProfile?.targetGoal || "",
            membershipTier: studentProfile?.membershipTier || DEFAULT_MEMBERSHIP_TIER,
            creditBalance: studentProfile?.creditBalance ?? 100,
            creditLimit: studentProfile?.creditLimit ?? 100,
            showWalletWidget: studentProfile?.showWalletWidget === true,
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
            weaknesses: studentProfile?.weaknesses || [],
            teacherNotes: studentProfile?.teacherNotes || "",
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
        const storedAvatarColor = profileAvatarColor || preferences.avatar_bg_color || localCustomization.avatar_bg_color || metadataAvatarColor;
        const savedAvatarColor = resolveAvatarColor(storedAvatarColor, preferences.avatarPreset);
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
        const savedBannerPosition = preferences.bannerPosition ?? preferences.banner_position
          ?? localCustomization.bannerPosition ?? localCustomization.banner_position
          ?? userMetadata.bannerPosition ?? userMetadata.banner_position;
        setBannerPosition(normalizeBannerPosition(savedBannerPosition));
        setDashboardBannerDimness(normalizeBannerDimness(
          preferences.bannerDimness ?? preferences.banner_dimness
            ?? preferences.dashboardBannerDimness ?? preferences.dashboard_banner_dimness
            ?? localCustomization.bannerDimness ?? localCustomization.banner_dimness
            ?? localCustomization.dashboard_banner_dimness ?? localCustomization.dashboardBannerDimness
            ?? userMetadata.bannerDimness ?? userMetadata.banner_dimness
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
    return <main className="min-h-screen bg-background text-[#e8e7e4]" />;
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
  const hasPublishedFeedback = displayLessons.some(
    (lesson) => lessonStates[lesson.id]?.evaluation?.published === true,
  );
  const unreadEvaluations = displayLessons.flatMap((lesson) => {
    const state = lessonStates[lesson.id];
    if (!state?.evaluation?.published || state.submission?.evaluationViewedAt) return [];
    return [{ lesson, submissionId: state.submissionId }];
  });
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
  const latestReport = lessonStates[displayLessons[0]?.id]?.evaluation;
  const currentCard = savedWords[cardIndex % Math.max(savedWords.length, 1)];
  const inProgressLessons = displayLessons.filter(
    (lesson) => getLessonStatus(lessonStates[lesson.id]) === "in-progress",
  ).length;
  const progressPercent = displayLessons.length
    ? Math.round((completedLessons / displayLessons.length) * 100)
    : 0;
  const displayName = activeStudent.name;
  const membershipTier = isMembershipTier(activeStudent.profile.membershipTier)
    ? activeStudent.profile.membershipTier
    : DEFAULT_MEMBERSHIP_TIER;
  const walletCreditLimit = Math.max(1, activeStudent.profile.creditLimit ?? 100);
  const walletCreditBalance = Math.max(0, Math.min(walletCreditLimit, activeStudent.profile.creditBalance ?? 100));
  const walletProgress = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        (walletCreditBalance / walletCreditLimit) *
          100,
      ),
    ),
  );
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
  const badgeColor = avatarColor || activeStudent.profile?.avatarBgColor || AVATAR_PRESETS[0].backgroundColor;
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
  const instructorLessonBanner = getFirstNonEmptyBannerUrl(
    lessonContent.customBannerUrl,
    lessonRecord?.banner_url,
    lessonRecord?.cover_image,
    lessonContent.bannerUrl,
    lessonContent.coverImage,
  );
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
  const lessonCardOrderIndex = new Map(lessonCardOrder.map((id, index) => [id, index]));
  const orderedAvailableLessons = [...availableLessons].sort((left, right) => {
    const leftIndex = lessonCardOrderIndex.get(left.id);
    const rightIndex = lessonCardOrderIndex.get(right.id);
    if (leftIndex === undefined && rightIndex === undefined) return 0;
    if (leftIndex === undefined) return 1;
    if (rightIndex === undefined) return -1;
    return leftIndex - rightIndex;
  });
  const lessonGroups = orderedAvailableLessons.reduce<Array<{ key: string; name: string; lessons: LessonWithVersion[] }>>((groups, lesson) => {
    const key = lesson.track_id || "__untracked__";
    let group = groups.find((candidate) => candidate.key === key);
    if (!group) {
      group = { key, name: lesson.track_name?.trim() || "My Lessons", lessons: [] };
      groups.push(group);
    }
    group.lessons.push(lesson);
    return groups;
  }, []);
  const saveLessonCardPreferences = (
    order: string[] = lessonCardOrder,
    viewMode: LessonCardViewMode = lessonCardViewMode,
  ) => {
    if (!activeStudent?.token || !lessonCardPreferencesLoaded) return;
    try {
      window.localStorage.setItem(getLessonCardPreferencesKey(activeStudent.token), JSON.stringify({ order, viewMode }));
    } catch (error) {
      console.warn("Unable to save lesson card preferences:", error);
    }
  };
  const updateLessonCardOrder = (draggedId: string, targetId: string) => {
    if (draggedId === targetId) return;
    const currentOrder = orderedAvailableLessons.map((lesson) => lesson.id);
    const fromIndex = currentOrder.indexOf(draggedId);
    const toIndex = currentOrder.indexOf(targetId);
    if (fromIndex < 0 || toIndex < 0) return;
    currentOrder.splice(fromIndex, 1);
    currentOrder.splice(toIndex, 0, draggedId);
    const nextOrder = [
      ...(nextLesson ? [nextLesson.id] : []),
      ...currentOrder,
      ...displayLessons.map((lesson) => lesson.id).filter((id) => !currentOrder.includes(id) && id !== nextLesson?.id),
    ];
    setLessonCardOrder(nextOrder);
    saveLessonCardPreferences(nextOrder);
  };
  const moveLessonCard = (lessonId: string, direction: -1 | 1) => {
    const currentOrder = orderedAvailableLessons.map((lesson) => lesson.id);
    const index = currentOrder.indexOf(lessonId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= currentOrder.length) return;
    [currentOrder[index], currentOrder[targetIndex]] = [currentOrder[targetIndex], currentOrder[index]];
    const nextOrder = [
      ...(nextLesson ? [nextLesson.id] : []),
      ...currentOrder,
      ...displayLessons.map((lesson) => lesson.id).filter((id) => !currentOrder.includes(id) && id !== nextLesson?.id),
    ];
    setLessonCardOrder(nextOrder);
    saveLessonCardPreferences(nextOrder);
  };
  const changeLessonCardViewMode = (viewMode: LessonCardViewMode) => {
    setLessonCardViewMode(viewMode);
    saveLessonCardPreferences(lessonCardOrder, viewMode);
  };
  const getLessonHref = (lesson: LessonWithVersion, status: LessonStatus) => {
    const lessonPath = lesson.content?.slug || lesson.slug || lesson.id;
    const reviewParam = status === "completed" || status === "pending-review"
      ? "?stage=report-card"
      : "";
    return `/lessons/${encodeURIComponent(lessonPath)}${reviewParam}`;
  };
  const getEvaluationHref = (lesson: LessonWithVersion, submissionId?: string) => {
    const lessonPath = lesson.content?.slug || lesson.slug || lesson.id;
    const submissionParam = submissionId
      ? `&submissionId=${encodeURIComponent(submissionId)}`
      : "";
    return `/lessons/${encodeURIComponent(lessonPath)}?stage=report-card${submissionParam}`;
  };
  const openUnreadEvaluation = (lesson: LessonWithVersion, submissionId?: string) => {
    setShowUnreadFeedbackModal(false);
    router.push(getEvaluationHref(lesson, submissionId));
  };
  const handleEvaluationStatusClick = () => {
    if (unreadEvaluations.length === 1) {
      const [unread] = unreadEvaluations;
      openUnreadEvaluation(unread.lesson, unread.submissionId);
    } else if (unreadEvaluations.length > 1) {
      setShowUnreadFeedbackModal(true);
    }
  };
  const rememberLesson = (lessonId: string) =>
    writeLastAccessedLesson(lessonId, token);

  const uploadProfileImage = async (file: File | undefined, kind: "avatar" | "banner") => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setProfileImageStatus("Choose a JPG, PNG, or WEBP image.");
      return;
    }

    const setUploading = kind === "avatar" ? setIsUploadingAvatar : setIsUploadingBanner;
    setUploading(true);
    setProfileImageStatus(`Uploading ${kind} image...`);
    try {
      const user = await getAuthenticatedUser();
      if (!user) throw new Error("Sign in to upload a profile image.");
      const extension = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
      const publicUrl = await uploadAsset(
        file,
        `${user.id}-${kind}-${crypto.randomUUID()}.${extension}`,
        kind === "banner" ? "banners" : "avatars",
      );
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
      bannerDimness: dashboardBannerDimness,
      banner_dimness: dashboardBannerDimness,
      dashboardBannerDimness,
      dashboard_banner_dimness: dashboardBannerDimness,
    };
    const customization = {
      avatar_bg_color: nextAvatarColor,
      avatar_initials: initials,
      avatar_url: avatarUrl,
      custom_avatar_url: avatarUrl,
      banner_url: bannerUrl,
      bannerPosition,
      banner_position: bannerPosition,
      bannerDimness: dashboardBannerDimness,
      banner_dimness: dashboardBannerDimness,
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
      await saveStudentProfile(token, {
        ...activeStudent.profile,
        fullName: displayName,
        avatarUrl,
        bannerUrl,
        avatarBgColor: nextAvatarColor,
        avatarInitials: initials,
      });
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
    <main className={`ml-16 min-h-screen bg-background text-[#e8e7e4] font-sans transition-[margin] duration-300 ease-in-out md:ml-16 ${profileOpen ? "md:ml-80" : ""}`}>
      {profileSaveNotice && <div role="status" className="fixed bottom-5 right-5 z-[100] flex items-center gap-3 rounded-md border border-emerald-500/30 bg-surface px-4 py-3 text-xs text-emerald-300 shadow-xl"><span>{profileSaveNotice}</span><button type="button" onClick={() => setProfileSaveNotice(null)} aria-label="Dismiss profile save notification" className="text-emerald-200/70 hover:text-emerald-100"><X className="h-4 w-4" /></button></div>}
      {profileSaveError && <div role="alert" className="fixed bottom-5 right-5 z-[100] flex items-center gap-3 rounded-md border border-red-500/40 bg-[#241719] px-4 py-3 text-xs text-red-200 shadow-xl"><span>{profileSaveError}</span><button type="button" onClick={() => setProfileSaveError(null)} aria-label="Dismiss profile save error" className="text-red-200/70 hover:text-red-100"><X className="h-4 w-4" /></button></div>}
      {profileOpen && (
        <button
          type="button"
          aria-label="Collapse student sidebar"
          onClick={() => setProfileOpen(false)}
          className="fixed inset-0 z-40 cursor-default bg-black/55 md:hidden"
        />
      )}
      {showUnreadFeedbackModal && <div
        className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) setShowUnreadFeedbackModal(false);
        }}
      >
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="unread-feedback-title"
          className="w-full max-w-lg rounded-xl border border-emerald-500/30 bg-surface p-5 shadow-2xl"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="unread-feedback-title" className="text-lg font-semibold text-stone-100">New Evaluation Feedback</h2>
              <p className="mt-1 text-sm text-stone-400">Choose a lesson to open its Report Card.</p>
            </div>
            <button
              type="button"
              onClick={() => setShowUnreadFeedbackModal(false)}
              aria-label="Close unread feedback list"
              className="rounded-md p-1 text-stone-400 transition hover:bg-border hover:text-stone-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <ul className="mt-4 space-y-2">
            {unreadEvaluations.map(({ lesson, submissionId }) => (
              <li key={`${lesson.id}:${submissionId || "latest"}`}>
                <button
                  type="button"
                  onClick={() => openUnreadEvaluation(lesson, submissionId)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-3 text-left text-sm text-stone-200 transition hover:border-emerald-500/40 hover:bg-emerald-950/20"
                >
                  <span className="min-w-0 truncate">{lesson.title}</span>
                  <span className="shrink-0 text-xs font-semibold text-emerald-300">View Report Card</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>}
      {membershipModalOpen && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setMembershipModalOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="membership-modal-title"
            className="my-auto max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-amber-500/20 bg-surface p-5 shadow-2xl shadow-black/50"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-400">Fluentia membership</p>
                <h2 id="membership-modal-title" className="mt-1 text-lg font-semibold text-stone-100">Academic standing</h2>
                <p className="mt-1 text-sm text-stone-400">Your current membership and learning progress.</p>
              </div>
              <button
                type="button"
                onClick={() => setMembershipModalOpen(false)}
                aria-label="Close membership details"
                className="rounded-md p-1.5 text-stone-400 transition hover:bg-border hover:text-stone-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.06] p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">Current academic tier</p>
                <p className="mt-2 inline-flex max-w-full rounded-md border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold tracking-[0.12em] text-amber-300">
                  {MEMBERSHIP_BADGE_LABELS[membershipTier]}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-background/70 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">Learning progress</p>
                  <span className="text-xs font-semibold tabular-nums text-stone-200">{progressPercent}%</span>
                </div>
                <p className="mt-1 text-xs text-stone-400">{completedLessons} of {displayLessons.length} lessons completed</p>
                <div
                  role="progressbar"
                  aria-label="Learning progress"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progressPercent}
                  aria-valuetext={`${completedLessons} of ${displayLessons.length} lessons completed`}
                  className="mt-3 h-1.5 overflow-hidden rounded-full bg-stone-800 ring-1 ring-inset ring-white/5"
                >
                  <div className="h-full rounded-full bg-[#F59E0B] transition-[width] duration-300" style={{ width: `${progressPercent}%` }} />
                </div>
              </div>
            </div>

            <div className="mt-5">
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">Academic tiers</h3>
              <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                {MEMBERSHIP_TIERS.map((tier) => {
                  const isCurrentTier = tier === membershipTier;
                  const TierIcon = MEMBERSHIP_TIER_DETAILS[tier].Icon;
                  return (
                    <li
                      key={tier}
                      className={`rounded-lg border p-3 transition-colors ${isCurrentTier ? "border-amber-500/30 bg-amber-500/[0.06]" : "border-border bg-background/50"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-amber-500/25 bg-amber-500/[0.08]">
                            <TierIcon className="h-4 w-4 text-[#F59E0B]" aria-hidden="true" />
                          </span>
                          <p className={`text-xs font-semibold tracking-wide ${isCurrentTier ? "text-amber-300" : "text-stone-200"}`}>
                            {MEMBERSHIP_BADGE_LABELS[tier]}
                          </p>
                        </div>
                        {isCurrentTier && <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-300">Current</span>}
                      </div>
                      <p className="mt-2 text-[11px] leading-relaxed text-stone-400">{MEMBERSHIP_TIER_DETAILS[tier].description}</p>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>
        </div>
      )}
      {walletModalOpen && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setWalletModalOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="wallet-modal-title"
            className="w-full max-w-md rounded-xl border border-amber-500/20 bg-surface p-5 shadow-2xl shadow-black/50"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-400">Fluentia credits</p>
                <h2 id="wallet-modal-title" className="mt-1 text-lg font-semibold text-stone-100">Credit wallet</h2>
                <p className="mt-1 text-sm text-stone-400">Your available evaluation credits.</p>
              </div>
              <button
                type="button"
                onClick={() => setWalletModalOpen(false)}
                aria-label="Close credit wallet"
                className="rounded-md p-1.5 text-stone-400 transition hover:bg-border hover:text-stone-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-5 rounded-lg border border-border bg-background/70 p-4">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">Available balance</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-stone-100">
                    {walletCreditBalance}
                    <span className="ml-1.5 text-xs font-medium text-stone-400">credits</span>
                  </p>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${walletCreditBalance === 0 ? "border-rose-500/20 bg-rose-500/10 text-rose-300" : walletCreditBalance < WALLET_REMINDER_THRESHOLD ? "border-amber-500/20 bg-amber-500/10 text-amber-300" : "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"}`}>
                  {walletCreditBalance === 0 ? "Depleted" : walletCreditBalance < WALLET_REMINDER_THRESHOLD ? "Low balance" : "Available"}
                </span>
              </div>
              <div
                role="progressbar"
                aria-label="Credit balance"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={walletProgress}
                aria-valuetext={`${walletCreditBalance} of ${walletCreditLimit} credits available`}
                className="mt-4 h-2 overflow-hidden rounded-full bg-stone-800 ring-1 ring-inset ring-white/5"
              >
                <div className="h-full rounded-full bg-[#F59E0B] shadow-[0_0_8px_rgba(245,158,11,0.3)] transition-[width] duration-300" style={{ width: `${walletProgress}%` }} />
              </div>
              <dl className="mt-4 divide-y divide-border/70 border-t border-border/70 text-xs">
                <div className="flex justify-between gap-4 py-2.5">
                  <dt className="text-stone-400">Credit limit</dt>
                  <dd className="font-medium tabular-nums text-stone-200">{walletCreditLimit} credits</dd>
                </div>
                <div className="flex justify-between gap-4 py-2.5">
                  <dt className="text-stone-400">Credits used</dt>
                  <dd className="font-medium tabular-nums text-stone-200">{walletCreditLimit - walletCreditBalance} credits</dd>
                </div>
                <div className="flex justify-between gap-4 py-2.5">
                  <dt className="text-stone-400">Academic tier</dt>
                  <dd className="text-right font-medium text-amber-300">{MEMBERSHIP_BADGE_LABELS[membershipTier]}</dd>
                </div>
              </dl>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-stone-500">Credits are used for instructor evaluations. Contact your instructor about balance updates.</p>
          </section>
        </div>
      )}
      <div className="mx-auto max-w-7xl px-4 pt-6 md:px-6">
        <HeroBanner
          imageUrl={dashboardHeaderBanner}
          position={bannerPosition}
          dimness={dashboardBannerDimness}
          onImageError={() => setBannerLoadFailed(true)}
        >
            <HeroBannerContent
              logo={<HeroBannerLogo />}
              badge={
                <span className="inline-flex items-center gap-2 rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-400 md:text-sm">
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
        </HeroBanner>
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between py-4">
          <p className="text-[12px] text-[#aeb2b9]">
            Welcome back, <span className="text-[#e6e4e0]">{displayName}</span>.
          </p>
          <div className="ml-auto flex items-center gap-2">
            <Tooltip content="Learning Hub">
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
            <Tooltip content="Dictionary">
              <button
                type="button"
                onClick={() => {
                  setDictionaryAnchor(null);
                  setDictionaryOpen(true);
                }}
                aria-label="Open dictionary"
                className={`group flex h-8 w-8 items-center justify-center rounded-lg border bg-slate-800/80 transition-all cursor-pointer ${dictionaryOpen ? "border-amber-500/40 text-amber-400" : "border-slate-700/60 text-slate-300 hover:border-amber-500/40 hover:text-amber-400 hover:bg-slate-800"}`}
              >
                <BookOpen className={`h-4 w-4 shrink-0 ${dictionaryOpen ? "text-amber-400" : "text-slate-400 group-hover:text-amber-400"}`} />
              </button>
            </Tooltip>
          </div>
        </div>

        <div className="py-8">
          <section
            className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch border-b border-border py-6"
            aria-label="Student progress overview"
          >
            <div
              className="relative order-last flex h-full min-h-[104px] flex-col justify-center rounded-xl border border-border bg-surface p-4"
              aria-label="Student profile"
            >
              <div className="flex items-center gap-3">
                <span
                  key={avatarRenderKey}
                  style={
                    !avatarImage
                      ? { backgroundColor: badgeColor }
                      : undefined
                  }
                  className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs  transition hover:ring-2 hover:ring-amber-500/40 ${avatarImage ? "bg-surface" : selectedAvatar.className}`}
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
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-stone-100">
                    {displayName}
                  </p>
                  <p className="mt-1 truncate text-[10px] text-stone-500">
                    {studentLevel}
                  </p>
                </div>
              </div>
                <aside
                  ref={profileSidebarRef}
                  id="student-sidebar"
                  aria-label="Student sidebar"
                  className={`fixed inset-y-0 left-0 z-50 flex h-dvh flex-col overflow-hidden border-r border-border bg-surface text-left shadow-2xl transition-[width] duration-300 ${profileOpen ? "w-80" : "w-16"}`}
                >
                  {profileOpen ? (
                    <>
                  <div className="flex items-center gap-3 border-b border-border p-4">
                    <Link
                      href="/dashboard"
                      aria-label="Fluentia home"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-500/10 p-1.5 transition-colors hover:border-amber-500/40 hover:bg-amber-500/15"
                    >
                      <img src="/logo.png" alt="" className="h-full w-full object-contain" />
                    </Link>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">
                        Fluentia
                      </p>
                      <p className="mt-1 text-sm font-semibold text-stone-100">
                        {displayName}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 border-b border-border px-3 pt-3">
                    <Tooltip content="View your profile and learning preferences">
                    <button
                      type="button"
                      onClick={() => setProfileTab("profile")}
                      aria-label="Profile and preferences"
                      className={`w-full whitespace-nowrap border-b-2 pb-2 text-[9px] font-medium uppercase tracking-[0.08em] focus:outline-none focus-visible:underline focus-visible:decoration-amber-400 focus-visible:underline-offset-4 ${profileTab === "profile" ? "border-amber-400 font-semibold text-amber-400" : "border-transparent text-stone-500 hover:text-stone-300"}`}
                    >
                      Profile
                    </button>
                    </Tooltip>
                    <Tooltip content="Choose your dashboard appearance">
                    <button
                      type="button"
                      onClick={() => setProfileTab("customization")}
                      aria-label="Customization"
                      className={`w-full whitespace-nowrap border-b-2 pb-2 text-[9px] font-medium uppercase tracking-[0.08em] focus:outline-none focus-visible:underline focus-visible:decoration-amber-400 focus-visible:underline-offset-4 ${profileTab === "customization" ? "border-amber-400 font-semibold text-amber-400" : "border-transparent text-stone-500 hover:text-stone-300"}`}
                    >
                      Customization
                    </button>
                    </Tooltip>
                    <Tooltip content="Choose your theme, contrast, brightness, and reading text size">
                    <button
                      type="button"
                      onClick={() => setProfileTab("display")}
                      aria-label="Display and appearance"
                      className={`flex min-h-11 w-full items-center justify-center whitespace-normal border-b-2 px-1 pb-2 text-center text-[9px] font-medium uppercase leading-tight tracking-[0.08em] focus:outline-none focus-visible:underline focus-visible:decoration-amber-400 focus-visible:underline-offset-4 ${profileTab === "display" ? "border-amber-400 font-semibold text-amber-400" : "border-transparent text-stone-500 hover:text-stone-300"}`}
                    >
                      Display &amp; Appearance
                    </button>
                    </Tooltip>
                  </div>
                  <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 text-xs">
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
                            <p className="mt-1 rounded-md border border-border bg-background p-2 text-stone-200">
                              {studentLevel}
                            </p>
                          </div>
                          <div>
                            <p className="text-stone-500">Learning goal</p>
                            <p className="mt-1 rounded-md border border-border bg-background p-2 text-stone-200">
                              {studentLearningGoal}
                            </p>
                          </div>
                        </div>
                        <div className="border-t border-border pt-3">
                          <p className="text-stone-500">Assigned instructor</p>
                          <p className="mt-1 rounded-md border border-border bg-background p-2 text-stone-200">
                            {assignedInstructorName}
                          </p>
                        </div>
                      </>
                    ) : profileTab === "customization" ? (
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
                                className={`flex items-center gap-2 rounded-md border border-slate-700/50 px-2 py-2 text-left text-[10px] text-stone-300 transition-colors ${avatarPreset === preset.id ? "bg-amber-500/5 text-amber-300" : "hover:border-slate-600"}`}
                              >
                                <span className="h-4 w-4 shrink-0 rounded-full" style={{ backgroundColor: preset.backgroundColor }} />
                                <span className="whitespace-nowrap text-[11px]">{preset.label}</span>
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
                              className="mt-1 w-full rounded-md border border-border bg-background p-2 text-xs uppercase text-stone-200"
                            />
                            <span className="mt-1 block text-[10px] text-stone-500">Leave blank to use your name initials.</span>
                          </label>
                          <div className="mt-3 flex items-center gap-3 rounded-md border border-slate-700/50 bg-background p-2">
                            <span style={{ backgroundColor: badgeColor }} className={`flex h-10 w-10 items-center justify-center overflow-hidden rounded-full text-xs font-bold ${selectedAvatar.className}`}>
                              {visibleAvatarInitials}
                            </span>
                            <span className="text-xs text-stone-400">Live badge preview</span>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Custom avatar image</p>
                          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-slate-700/50 px-3 py-2 text-xs text-stone-300 transition-colors hover:border-slate-600">
                            <Upload className="h-4 w-4" />{isUploadingAvatar ? "Uploading avatar..." : "Upload avatar image"}
                            <input ref={avatarFileRef} type="file" accept="image/jpeg,image/png,image/webp" disabled={isUploadingAvatar} onChange={(event) => void uploadProfileImage(event.target.files?.[0], "avatar")} className="sr-only" />
                          </label>
                          <p className="text-[10px] leading-relaxed text-stone-500">Recommended: 400×400 px (1:1). JPG, PNG, or WEBP.</p>
                          <label className="block text-xs text-stone-400">Or use an image URL
                            <input value={customAvatarUrl} onChange={(event) => setCustomAvatarUrl(event.target.value)} placeholder="https://..." className="mt-1 w-full rounded-md border border-border bg-background p-2 text-xs text-stone-200" />
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
                                  className={`overflow-hidden rounded-md border transition ${isSelected ? "border-amber-500/40 ring-1 ring-amber-500/40" : "border-border hover:border-amber-500/40"}`}
                                >
                                  <img src={preset.image} alt="" className="h-12 w-full object-cover" />
                                  <span className="block truncate px-1.5 py-1 text-left text-[9px] text-stone-300">
                                    {preset.label}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                          <div className="relative aspect-video overflow-hidden rounded-md border border-border bg-background">
                            <img
                              src={activeBannerUrl}
                              alt="Banner preview"
                              style={getBannerPositionStyles(bannerPosition)}
                              className="h-full w-full object-cover"
                            />
                            <div style={getBannerOverlayStyles(dashboardBannerDimness)} className="pointer-events-none absolute inset-0" />
                          </div>
                          <BannerPositionControls
                            position={bannerPosition}
                            dimness={dashboardBannerDimness}
                            onPositionChange={setBannerPosition}
                            onDimnessChange={setDashboardBannerDimness}
                            dimnessLabel="Dashboard banner dimness"
                          />
                          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-slate-700/50 px-3 py-2 text-xs text-stone-300 transition-colors hover:border-slate-600">
                            <Upload className="h-4 w-4" />{isUploadingBanner ? "Uploading banner..." : "Upload banner image"}
                            <input ref={bannerFileRef} type="file" accept="image/jpeg,image/png,image/webp" disabled={isUploadingBanner} onChange={(event) => void uploadProfileImage(event.target.files?.[0], "banner")} className="sr-only" />
                          </label>
                          <p className="text-[10px] leading-relaxed text-stone-500">Recommended: 1200×300 px (4:1). JPG, PNG, or WEBP.</p>
                          <label className="block text-xs text-stone-400">Or use an image URL
                            <input value={customBannerUrl} onChange={(event) => setCustomBannerUrl(event.target.value)} placeholder="https://..." className="mt-1 w-full rounded-md border border-border bg-background p-2 text-xs text-stone-200" />
                          </label>
                        </div>
                        {profileImageStatus && <p role="status" className="rounded-md border border-amber-400/20 bg-amber-950/30 p-2 text-[10px] text-amber-400">{profileImageStatus}</p>}
                      </>
                    ) : (
                      <DisplaySettingsPanel embedded />
                    )}
                    {profileTab === "customization" && (
                      <Tooltip content="Save your profile and appearance settings">
                        <button
                          type="button"
                          onClick={() => void saveProfileCustomization()}
                          disabled={isSavingProfileCustomization || isUploadingAvatar || isUploadingBanner}
                          className="w-full rounded-md bg-amber-500/20 px-3 py-2 text-xs text-amber-400 transition hover:bg-amber-500/25 disabled:cursor-wait disabled:opacity-60"
                        >
                          {isSavingProfileCustomization ? "Saving..." : "Save settings"}
                        </button>
                      </Tooltip>
                    )}
                  </div>
                  <div className="flex items-center justify-center gap-2 border-t border-border bg-surface px-3 py-3">
                    <Tooltip content="Profile and preferences">
                      <button
                        type="button"
                        onClick={() => { setProfileTab("profile"); setProfileOpen(true); }}
                        aria-label="Open profile and preferences"
                        aria-expanded={profileOpen && profileTab === "profile"}
                        style={!avatarImage ? { backgroundColor: badgeColor } : undefined}
                        className={`flex h-9 w-9 items-center justify-center overflow-hidden rounded-full text-xs text-white ring-1 ring-border transition hover:ring-amber-500/50 ${avatarImage ? "bg-surface" : selectedAvatar.className}`}
                      >
                        {avatarImage ? <img src={avatarImage} alt="" className="h-full w-full object-cover" /> : profileInitials}
                      </button>
                    </Tooltip>
                    <Tooltip content="Settings">
                      <button
                        type="button"
                        onClick={() => {
                          if (profileOpen && profileTab === "display") {
                            setProfileOpen(false);
                          } else {
                            setProfileTab("display");
                            setProfileOpen(true);
                          }
                        }}
                        aria-label="Toggle settings"
                        aria-expanded={profileOpen}
                        className={`flex h-9 w-9 items-center justify-center rounded-md transition ${profileOpen ? "bg-amber-500/10 text-amber-300" : "text-stone-400 hover:bg-amber-500/10 hover:text-amber-300"}`}
                      >
                        <Settings className="h-4 w-4" />
                      </button>
                    </Tooltip>
                  </div>
                    </>
                  ) : (
                    <div className="flex h-full flex-col items-center py-4" aria-label="Student sidebar">
                      <Tooltip content="Fluentia home" placement="right">
                        <Link href="/dashboard" aria-label="Fluentia home" className="flex h-9 w-9 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-500/10 p-1.5 transition-colors hover:border-amber-500/40 hover:bg-amber-500/15">
                          <img src="/logo.png" alt="" className="h-full w-full object-contain" />
                        </Link>
                      </Tooltip>
                      <nav className="mt-4 flex min-h-0 flex-1 flex-col items-center gap-2" aria-label="Quick navigation">
                        <Tooltip content="Learning Hub" placement="right">
                          <button type="button" onClick={() => setSidebarOpen((open) => !open)} aria-label="Learning Hub" aria-expanded={sidebarOpen} aria-controls="learning-sidebar" className={`flex h-9 w-9 items-center justify-center rounded-md transition ${sidebarOpen ? "bg-amber-500/10 text-amber-300" : "text-stone-400 hover:bg-amber-500/10 hover:text-amber-300"}`}>
                            <PanelRight className="h-4 w-4" />
                          </button>
                        </Tooltip>
                        <Tooltip content="Home" placement="right">
                          <Link href="/dashboard" aria-label="Home" className="flex h-9 w-9 items-center justify-center rounded-md text-stone-400 transition hover:bg-amber-500/10 hover:text-amber-300">
                            <Home className="h-4 w-4" />
                          </Link>
                        </Tooltip>
                        <Tooltip content="Membership" placement="right">
                          <button
                            type="button"
                            onClick={() => { setWalletModalOpen(false); setMembershipModalOpen(true); }}
                            aria-label="Open membership details"
                            className="flex h-9 w-9 items-center justify-center rounded-md text-stone-400 transition hover:bg-amber-500/10 hover:text-amber-300"
                          >
                            <Award className="h-4 w-4" />
                          </button>
                        </Tooltip>
                        <Tooltip content="Wallet and credits" placement="right">
                          <button
                            type="button"
                            onClick={() => { setMembershipModalOpen(false); setWalletModalOpen(true); }}
                            aria-label="Open credit wallet"
                            className="flex h-9 w-9 items-center justify-center rounded-md text-stone-400 transition hover:bg-amber-500/10 hover:text-amber-300"
                          >
                            <WalletCards className="h-4 w-4" />
                          </button>
                        </Tooltip>
                        <Tooltip content="Dictionary" placement="right">
                          <button type="button" onClick={() => setDictionaryOpen(true)} aria-label="Open Dictionary" className="flex h-9 w-9 items-center justify-center rounded-md text-stone-400 transition hover:bg-amber-500/10 hover:text-amber-300">
                            <BookOpen className="h-4 w-4" />
                          </button>
                        </Tooltip>
                      </nav>
                      <div className="mt-3 flex flex-col items-center gap-2 border-t border-border pt-3">
                        <Tooltip content="Profile and preferences" placement="right">
                          <button
                            type="button"
                            onClick={() => { setProfileTab("profile"); setProfileOpen(true); }}
                            aria-label="Open profile and preferences"
                            aria-expanded={profileOpen && profileTab === "profile"}
                            aria-controls="student-sidebar"
                            style={!avatarImage ? { backgroundColor: badgeColor } : undefined}
                            className={`flex h-9 w-9 items-center justify-center overflow-hidden rounded-full text-xs ring-1 ring-border transition hover:ring-amber-500/50 ${avatarImage ? "bg-surface" : selectedAvatar.className}`}
                          >
                          {avatarImage ? <img src={avatarImage} alt="" className="h-full w-full object-cover" /> : profileInitials}
                          </button>
                        </Tooltip>
                        <Tooltip content="Settings" placement="right">
                          <button
                            type="button"
                            onClick={() => { setProfileTab("display"); setProfileOpen(true); }}
                            aria-label="Open settings"
                            aria-expanded={profileOpen}
                            aria-controls="student-sidebar"
                            className={`flex h-9 w-9 items-center justify-center rounded-md transition ${profileOpen ? "bg-amber-500/10 text-amber-300" : "text-stone-400 hover:bg-amber-500/10 hover:text-amber-300"}`}
                          >
                            <Settings className="h-4 w-4" />
                          </button>
                        </Tooltip>
                      </div>
                    </div>
                  )}
                </aside>
            </div>
            <Tooltip content={`${completedLessons} of ${displayLessons.length} available lessons are complete`}>
            <div className="flex h-full min-h-[104px] w-full flex-col justify-center rounded-xl border border-border bg-surface p-4">
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
            <Tooltip content={unreadEvaluations.length > 0
              ? "Open your unread evaluation feedback"
              : hasPublishedFeedback
                ? "All published evaluation feedback has been viewed"
                : "Your instructor has not published evaluation feedback yet"}>
            <button
              type="button"
              onClick={handleEvaluationStatusClick}
              aria-haspopup={unreadEvaluations.length > 1 ? "dialog" : undefined}
              className="flex h-full min-h-[104px] w-full cursor-pointer flex-col justify-center rounded-xl border border-border bg-surface p-4 text-left transition hover:border-emerald-500/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#667084]">
                Overall Evaluation Status
              </p>
              <p
                className={`mt-2 flex items-center gap-2 text-sm font-semibold ${hasPublishedFeedback ? "text-emerald-400" : "text-amber-400"}`}
              >
                {hasPublishedFeedback ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <Clock3 className="h-4 w-4" />
                )}
                {unreadEvaluations.length > 1
                  ? `${unreadEvaluations.length} New Evaluations Ready`
                  : unreadEvaluations.length === 1
                    ? "1 New Evaluation Ready"
                    : hasPublishedFeedback
                      ? "All Evaluations Reviewed"
                  : hasPendingReview
                    ? "Pending Evaluation"
                    : "Pending Evaluation"}
              </p>
            </button>
            </Tooltip>
          </section>

          <section
            className="mt-6 rounded-xl border border-amber-500/40 bg-surface p-5"
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
            className="mt-6 rounded-xl border border-border bg-surface p-5"
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
                  className="flex min-h-24 flex-1 items-center justify-center rounded-lg border border-amber-500/40 bg-background p-4 text-center transition hover:border-amber-500/40"
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
              <p className="mt-4 rounded-lg border border-dashed border-border p-4 text-sm text-stone-500">
                Save words in the Study Room dictionary to build your first
                deck.
              </p>
            )}
          </section>

          {nextLesson && (
            <section className="mt-6" aria-label="Continue learning">
              <article className="group relative h-64 w-full overflow-hidden rounded-xl border border-border bg-surface transition-colors duration-300 hover:border-amber-500/40">
                <img
                  src={instructorLessonBanner || BANNER_PRESETS[0].image}
                  alt=""
                  style={getBannerPositionStyles(nextLessonBannerPosition)}
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <div style={{ opacity: nextLessonBannerDimness / 100 }} className="absolute inset-0 bg-[linear-gradient(90deg,rgba(12,16,23,.72),rgba(12,16,23,.24)),linear-gradient(0deg,rgba(12,16,23,.92),transparent_65%)]" />
                <span className="absolute left-5 top-4 z-10 rounded-md border-none bg-amber-500/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-amber-400">
                  Module {activeModuleNumber ?? 1}
                </span>
                {nextLessonStatus && (
                  <span className={`absolute right-5 top-4 z-10 rounded-md border-none px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] ${
                    nextLessonStatus === "in-progress"
                      ? "bg-sky-500/10 text-sky-400"
                      : nextLessonStatus === "pending-review"
                        ? "bg-amber-500/10 text-amber-400"
                        : nextLessonStatus === "completed"
                          ? "bg-emerald-500/10 text-emerald-400"
                          : "bg-slate-800/40 text-slate-400"
                  }`}>
                    {getLessonStatusCopy(nextLessonStatus)}
                  </span>
                )}
                <div className="relative flex h-full flex-col justify-end p-5 md:p-7">
                  <div className="max-w-3xl pr-28 md:pr-36">
                    {nextLesson.track_name && <p className="mb-2 inline-flex max-w-full items-center gap-1.5 truncate rounded-md border border-amber-500/30 bg-black/30 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-300"><Folder className="h-3 w-3 shrink-0" />{nextLesson.track_name}</p>}
                    <div className="flex items-center gap-2 text-slate-400">
                      <BookOpen className="h-4 w-4" />
                      <span className="text-xs font-medium uppercase tracking-[0.14em]">
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
                    <div className="mt-3 flex items-center">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#F59E0B] text-[10px] font-bold text-white">AV</span>
                        <p className="min-w-0 text-xs text-slate-400">
                          Guided by{" "}
                        {nextLesson.content?.instructor?.fullName ||
                          assignedInstructorName}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="absolute bottom-5 right-5 flex items-end justify-end md:bottom-7 md:right-7">
                    <Tooltip content={`Continue to ${nextLesson.title}.`}>
                      <Link
                        href={getLessonHref(nextLesson, nextLessonStatus || "not-started")}
                        onClick={() => rememberLesson(nextLesson.id)}
                        className="inline-flex w-fit items-center rounded-lg border-none bg-amber-500/10 px-4 py-2 text-xs font-medium text-amber-400 transition-all hover:bg-amber-500/20"
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
              <div className="flex h-64 flex-col justify-center rounded-xl border border-border bg-surface p-5 md:p-7">
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
              className="mt-6 rounded-xl border border-border bg-surface p-5"
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
                  {latestReport.voiceFeedbackUrl && (
                    <Tooltip content="Open your instructor's voice feedback">
                      <a href={latestReport.voiceFeedbackUrl} className="mt-1 block w-full truncate text-sm text-amber-400 hover:text-amber-300">
                        General voice feedback
                      </a>
                    </Tooltip>
                  )}
                  {Object.entries(latestReport.stageVoiceFeedback || {}).filter(([, voiceUrl]) => Boolean(voiceUrl)).map(([stageId, voiceUrl]) => (
                    <Tooltip key={stageId} content={`Open voice feedback for ${stageId.replaceAll("_", " ")}`}>
                      <a href={voiceUrl} className="mt-1 block w-full truncate text-sm text-amber-400 hover:text-amber-300">
                        {stageId.replaceAll("_", " ")} feedback
                      </a>
                    </Tooltip>
                  ))}
                  {!latestReport.voiceFeedbackUrl && !Object.values(latestReport.stageVoiceFeedback || {}).some(Boolean) && (
                    <p className="mt-1 text-sm text-stone-400">No voice feedback attached.</p>
                  )}
                </div>
              </div>
            </section>
          )}

          <section className="pt-8" aria-label="Previous lessons">
            {availableLessons.length > 0 && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#667084]">
                  Previous lessons
                </h2>
                <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface p-1" role="group" aria-label="Lesson card view">
                  <button
                    type="button"
                    onClick={() => changeLessonCardViewMode("grid")}
                    aria-label="Show lessons in a grid"
                    aria-pressed={lessonCardViewMode === "grid"}
                    className={`rounded-md p-2 transition ${lessonCardViewMode === "grid" ? "bg-amber-500/20 text-amber-400" : "text-stone-400 hover:text-stone-200"}`}
                  >
                    <LayoutGrid className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => changeLessonCardViewMode("list")}
                    aria-label="Show lessons as a list"
                    aria-pressed={lessonCardViewMode === "list"}
                    className={`rounded-md p-2 transition ${lessonCardViewMode === "list" ? "bg-amber-500/20 text-amber-400" : "text-stone-400 hover:text-stone-200"}`}
                  >
                    <List className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            )}
            {availableLessons.length > 1 && (
              <p className="mb-3 text-xs text-stone-500">Lessons are grouped by track. Drag cards or use the arrows to reorder lessons.</p>
            )}
            <div className="space-y-5">
              {orderedAvailableLessons.length === 0 ? (
                <p className="col-span-full rounded-xl border border-dashed border-border bg-surface p-6 text-center text-sm text-stone-500">
                  No previous lessons yet. Your instructor will assign more
                  lessons here.
                </p>
              ) : (
                lessonGroups.map((group) => {
                  const isCollapsed = collapsedTrackIds.has(group.key);
                  const allGroupLessons = displayLessons.filter((lesson) => (lesson.track_id || "__untracked__") === group.key);
                  const completedInGroup = allGroupLessons.filter((lesson) => {
                    const status = getLessonStatus(lessonStates[lesson.id]);
                    return status === "completed" || status === "pending-review";
                  }).length;
                  return (
                    <section key={group.key} className="rounded-xl border border-border/70 bg-background/30 p-3 sm:p-4">
                      <button
                        type="button"
                        onClick={() => setCollapsedTrackIds((current) => {
                          const next = new Set(current);
                          if (next.has(group.key)) next.delete(group.key);
                          else next.add(group.key);
                          return next;
                        })}
                        aria-expanded={!isCollapsed}
                        className="mb-3 flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-surface/70"
                      >
                        <Folder className="h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-stone-100">{group.name}</span>
                        <span className="shrink-0 text-[11px] text-stone-500">{completedInGroup}/{allGroupLessons.length} complete</span>
                        <ChevronDown className={`h-4 w-4 shrink-0 text-stone-400 transition-transform ${isCollapsed ? "-rotate-90" : ""}`} aria-hidden="true" />
                      </button>
                      {!isCollapsed && <div className={lessonCardViewMode === "grid" ? "grid gap-5 md:grid-cols-2" : "flex flex-col gap-3"}>
                {group.lessons.map((lesson) => {
                  const lessonIndex = orderedAvailableLessons.findIndex((orderedLesson) => orderedLesson.id === lesson.id);
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
                        ? "Review Submission"
                        : status === "in-progress"
                          ? "Continue Lesson"
                          : "Start Lesson";
                  return (
                    <article
                      key={lesson.id}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        const draggedId = event.dataTransfer.getData("text/plain");
                        if (draggedId) updateLessonCardOrder(draggedId, lesson.id);
                        setDraggedLessonId(null);
                      }}
                      className={`group flex overflow-hidden rounded-xl border border-border bg-surface transition-colors duration-300 hover:border-amber-500/40 ${lessonCardViewMode === "grid" ? "flex-col" : "flex-col md:flex-row"} ${draggedLessonId === lesson.id ? "opacity-50" : ""}`}
                    >
                      <div className={`relative h-44 overflow-hidden border-b border-border ${lessonCardViewMode === "list" ? "md:h-auto md:w-48 md:shrink-0 md:border-b-0 md:border-r" : ""}`}>
                        <img
                          src={
                            getFirstNonEmptyBannerUrl(
                              (lesson.content as Record<string, unknown> | undefined)?.customBannerUrl,
                              (lesson.content as Record<string, unknown> | undefined)?.bannerUrl,
                              (lesson.content as Record<string, unknown> | undefined)?.coverImage,
                            ) || BANNER_PRESETS[0].image
                          }
                          alt=""
                          style={getBannerPositionStyles(lessonBannerPosition)}
                          className="h-full w-full object-cover"
                        />
                        <div style={{ opacity: lessonBannerDimness / 100 }} className="absolute inset-0 bg-[linear-gradient(90deg,rgba(12,16,23,.72),rgba(12,16,23,.24)),linear-gradient(0deg,rgba(12,16,23,.92),transparent_65%)]" />
                        <span className="absolute bottom-4 left-5 rounded-md border-none bg-amber-500/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-amber-400">
                          Module {lesson.content?.moduleNumber || 1}
                        </span>
                      </div>
                      <div className="flex flex-1 flex-col p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-center gap-2 text-slate-400">
                            <BookOpen className="h-4 w-4" />
                            <span className="text-xs font-medium uppercase tracking-[0.14em]">
                              Lesson
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Tooltip content={`Lesson status: ${statusCopy.toLowerCase()}`}>
                              <span
                                className={`rounded-md border-none px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] ${
                                  status === "completed"
                                    ? "bg-emerald-500/10 text-emerald-400"
                                    : status === "pending-review"
                                      ? "bg-amber-500/10 text-amber-400"
                                      : status === "in-progress"
                                        ? "bg-sky-500/10 text-sky-400"
                                        : "bg-slate-800/40 text-slate-400"
                                }`}
                              >
                                {statusCopy}
                              </span>
                            </Tooltip>
                            {availableLessons.length > 1 && (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  draggable
                                  onDragStart={(event) => {
                                    event.dataTransfer.setData("text/plain", lesson.id);
                                    event.dataTransfer.effectAllowed = "move";
                                    setDraggedLessonId(lesson.id);
                                  }}
                                  onDragEnd={() => setDraggedLessonId(null)}
                                  aria-label={`Drag to move ${lesson.title}`}
                                  title="Drag to reorder"
                                  className="touch-none cursor-grab rounded p-1 text-stone-500 hover:bg-background hover:text-stone-200 active:cursor-grabbing"
                                >
                                  <GripVertical className="h-4 w-4" aria-hidden="true" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveLessonCard(lesson.id, -1)}
                                  disabled={lessonIndex === 0}
                                  aria-label={`Move ${lesson.title} up`}
                                  className="rounded p-1 text-stone-500 hover:bg-background hover:text-stone-200 disabled:cursor-not-allowed disabled:opacity-30"
                                >
                                  <ChevronUp className="h-4 w-4" aria-hidden="true" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveLessonCard(lesson.id, 1)}
                                  disabled={lessonIndex === orderedAvailableLessons.length - 1}
                                  aria-label={`Move ${lesson.title} down`}
                                  className="rounded p-1 text-stone-500 hover:bg-background hover:text-stone-200 disabled:cursor-not-allowed disabled:opacity-30"
                                >
                                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                        <div>
                          <h2 className="mt-2 font-sans text-xl font-semibold text-stone-100">
                            {lesson.title}
                          </h2>
                          <p className="mt-2 text-sm leading-relaxed text-stone-400">
                            {lesson.content?.subtitle ||
                              "Continue your personalized language practice."}
                          </p>
                          <div className="mt-3 flex min-w-0 items-center gap-2">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#F59E0B] text-[10px] font-bold text-white">AV</span>
                            <p className="min-w-0 text-xs text-slate-400">
                              Guided by{" "}
                            {lesson.content?.instructor?.fullName ||
                              assignedInstructorName}
                            </p>
                          </div>
                        </div>
                        <div className="mt-auto flex justify-end pt-5">
                          <Tooltip content={`${ctaCopy}: ${lesson.title}`}>
                            <Link
                              href={getLessonHref(lesson, status)}
                              onClick={() => rememberLesson(lesson.id)}
                              className="inline-flex rounded-lg border-none bg-amber-500/10 px-4 py-2 text-xs font-medium text-amber-400 transition-all hover:bg-amber-500/20"
                            >
                              {ctaCopy}
                            </Link>
                          </Tooltip>
                        </div>
                      </div>
                    </article>
                  );
                })
                      }</div>}
                    </section>
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
            setDictionaryAnchor(null);
          }}
          anchor={dictionaryAnchor}
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
