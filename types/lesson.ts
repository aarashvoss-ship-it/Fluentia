export type StudyStepId =
  | "warm_up"
  | "lesson"
  | "listening"
  | "reading"
  | "writing"
  | "speaking"
  | "results";

export interface StudyStep {
  id: StudyStepId;
  label: string;
  stepNumber: string;
}

export const STUDY_STEPS: StudyStep[] = [
  { id: "warm_up", label: "Warm-up", stepNumber: "01" },
  { id: "lesson", label: "Lesson", stepNumber: "02" },
  { id: "listening", label: "Listening", stepNumber: "03" },
  { id: "reading", label: "Reading", stepNumber: "04" },
  { id: "writing", label: "Writing", stepNumber: "05" },
  { id: "speaking", label: "Speaking", stepNumber: "06" },
  { id: "results", label: "Results", stepNumber: "07" },
];

export interface LessonSection {
  id?: string;
  title?: string;
  content?: string;
  [key: string]: unknown;
}

export interface LessonExercise {
  id?: string;
  prompt?: string;
  answer?: string;
  [key: string]: unknown;
}

export interface LessonContent {
  id: string;
  slug: string;
  title: string;
  subtitle?: string;
  moduleNumber: number;
  status: string;
  coverImage?: string;
<<<<<<< HEAD
  ambientMusicUrl?: string;
  studentName?: string;
  status?: 'draft' | 'published' | 'archived';
  instructor?: {
    initials?: string;
    fullName?: string;
  };
  content?: InstructorLessonMock["content"];
=======
  audioUrl?: string;
  ambientMusicUrl?: string;
  content?: StrictStepContent;
  sections?: LessonSection[];
  exercises?: LessonExercise[];
  vocabulary?: SavedVocabularyWord[];
  studentName?: string;
  instructor?: {
    fullName: string;
    initials: string;
  };
}

export interface Lesson extends LessonContent {
  studentId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface BlockItem {
  text?: string;
  content?: string;
  enabled: boolean;
}

export interface StrictStepContent {
  warm_up?: {
    prompt?: BlockItem;
    reflectionQuestion?: BlockItem;
    [key: string]: unknown;
  };
  lesson?: {
    mainArticle?: BlockItem;
    [key: string]: unknown;
  };
  listening?: Record<string, unknown>;
  reading?: Record<string, unknown>;
  writing?: Record<string, unknown>;
  speaking?: Record<string, unknown>;
  results?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface LessonEvaluation {
  scores: Record<string, number>;
  comments: string;
  criterionFeedback?: Record<string, string>;
  strengths?: string;
  areasToImprove?: string;
  studyHubPrescription?: string;
  voiceFeedbackUrl?: string;
  totalScore?: number;
  published: boolean;
}

export type SubmissionStatus = "not_started" | "in_progress" | "submitted" | "reviewed";

export interface StudentSubmission {
  status: SubmissionStatus;
  listeningAnswers?: Record<string, unknown>;
  readingAnswers?: Record<string, unknown>;
  writingText?: string;
  speakingAudioUrl?: string;
  blockResponses?: Record<string, unknown>;
  quizSelections?: Record<string, unknown>;
  audioUploads?: Record<string, unknown>;
  submittedAt?: string;
}

export interface SavedVocabularyWord {
  id?: string;
  word: string;
  definition: string;
  context?: string;
  example?: string;
  partOfSpeech?: string;
  phonetic?: string;
  pronunciationUrl?: string;
  lessonId?: string;
  lessonSlug?: string;
  source: "merriam-webster" | "free-dictionary";
  savedAt: string;
}

export interface StudentNote {
  id: string;
  text: string;
  content?: string;
  lessonId?: string;
  lessonSlug?: string;
  createdAt?: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  tab: "instructor" | "support";
  sender: "student" | "instructor" | "support";
  text: string;
  timestamp?: string;
  createdAt: string;
}

export interface PublishedLessonState {
  content: StrictStepContent;
  bannerUrl: string;
  studentProfile: StudentProfile;
  evaluation: LessonEvaluation;
  status: "draft" | "published";
  submission?: StudentSubmission;
>>>>>>> 8a26c78 (Restore instructor and workstation components from last night's backup)
}
export interface StudentProfile {
  id?: string;
  fullName: string;
  avatarUrl?: string;
  level: string;
  targetGoal: string;
  weaknesses: string[];
  teacherNotes: string;
  attendanceRate: number;
  completedModulesCount: number;
}

export interface InstructorLessonMock {
  id: string;
  title: string;
  module_tag?: string;
  moduleNumber: number;
  studentName: string;
<<<<<<< HEAD
  banner_image_url: string;
  bannerUrl?: string;
=======
  bannerUrl: string;
>>>>>>> 8a26c78 (Restore instructor and workstation components from last night's backup)
  studentProfile: StudentProfile;
  content: StrictStepContent;
}
export interface ChatMessage {
  id: string;
  sender: 'user' | 'ai' | 'instructor';
  text: string;
  timestamp: string;
  tab?: "instructor" | "support";
}

export interface SavedVocabularyWord {
  id: string;
  word: string;
  definition?: string;
  translation?: string;
  partOfSpeech?: string;
  example?: string;
  phonetic?: string;
  pronunciationUrl?: string;
  source?: "merriam-webster" | "free-dictionary";
  savedAt?: string;
}

export interface StudentNote {
  id: string;
  content: string;
  createdAt: string;
  lessonSlug?: string;
}

export interface LessonEvaluation {
  scores: Record<string, number>;
  comments: string;
  criterionFeedback?: Record<string, string>;
  strengths?: string;
  areasToImprove?: string;
  studyHubPrescription?: string;
  voiceFeedbackUrl?: string;
  published?: boolean;
}

export type StudentSubmissionStatus = "in_progress" | "submitted" | "reviewed";

export interface StudentSubmission {
  status: StudentSubmissionStatus;
  listeningAnswers: Record<string, string>;
  readingAnswers: Record<string, string>;
  writingText: string;
  speakingAudioUrl?: string;
  blockResponses?: Record<string, string>;
  quizSelections?: Record<string, string>;
  audioUploads?: Record<string, string>;
  submittedAt?: string;
}

export type StrictStepContent = Record<string, any>;