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
  { id: "warm_up",   label: "Warm-up",   stepNumber: "01" },
  { id: "lesson",    label: "Lesson",    stepNumber: "02" },
  { id: "listening", label: "Listening", stepNumber: "03" },
  { id: "reading",   label: "Reading",   stepNumber: "04" },
  { id: "writing",   label: "Writing",   stepNumber: "05" },
  { id: "speaking",  label: "Speaking",  stepNumber: "06" },
  { id: "results",   label: "Results",   stepNumber: "07" },
];

export interface BlockItem {
  text: string;
  enabled: boolean;
}

export interface StepWarmUpContent {
  quote?: BlockItem;
  intro_narrative?: BlockItem;
  media_block?: {
    image_url: string;
    caption?: string;
    enabled: boolean;
  };
  quick_prompts?: BlockItem[];
  lexicon_notes?: BlockItem;
}

export interface StepLessonContent {
  core_concept?: BlockItem;
  examples?: BlockItem[];
  flexible_exercises?: BlockItem[];
}

export interface StepListeningContent {
  audio_url?: string;
  audio_meta?: {
    duration_seconds?: number;
    speaker?: string;
  };
  transcript?: BlockItem;
  questions?: Array<{
    id: string;
    question: string;
    options?: string[];
    correct_answer?: string;
    enabled: boolean;
  }>;
}

export interface StepReadingContent {
  article_markdown?: BlockItem;
  vocabulary_drawer?: Array<{
    word: string;
    definition: string;
    enabled: boolean;
  }>;
  analytical_questions?: Array<{
    id: string;
    question: string;
    enabled: boolean;
  }>;
}

export interface StepWritingContent {
  prompt?: BlockItem;
  framework_tips?: BlockItem[];
  min_words?: number;
  target_words?: number;
  draft_editor?: {
    enabled: boolean;
    placeholder?: string;
  };
}

export interface StepSpeakingContent {
  scenario?: BlockItem;
  discussion_points?: BlockItem[];
  delivery_tips?: BlockItem[];
  audio_capture?: {
    enabled: boolean;
    max_duration_seconds?: number;
  };
}

export interface StepResultsContent {
  answer_keys?: {
    listening?: Record<string, string>;
    reading?: Record<string, string>;
  };
  unlocked_transcripts?: boolean;
  self_reflection?: BlockItem;
  instructor_review_card?: {
    enabled: boolean;
    prompt?: string;
  };
}

export interface LessonContent {
  id: string;
  slug: string;
  title: string;
  subtitle?: string;
  moduleNumber: number;
  coverImage?: string;
  ambientMusicUrl?: string;
  studentName?: string;
  status?: 'draft' | 'published' | 'archived';
  instructor?: {
    initials?: string;
    fullName?: string;
  };
  content?: InstructorLessonMock["content"];
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
  module_tag: string;
  studentName: string;
  banner_image_url: string;
  bannerUrl?: string;
  studentProfile: StudentProfile;
  content: {
    warm_up?: StepWarmUpContent;
    lesson?: StepLessonContent;
    listening?: StepListeningContent;
    reading?: StepReadingContent;
    writing?: StepWritingContent;
    speaking?: StepSpeakingContent;
    results?: StepResultsContent;
  };
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