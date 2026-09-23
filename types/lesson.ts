import type { StudentId } from "@/types/database";

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
  { id: "results",   label: "Results & Review",   stepNumber: "07" },
];

export interface BlockItem {
  text: string;
  enabled: boolean;
}

export type ContentBlockType = "text" | "audio" | "video" | "image" | "resource" | "question" | "quiz" | "fill-in-the-blanks" | "writing";

export interface QuizQuestion {
  id: string;
  prompt: string;
  options: string[];
  correctAnswer?: string;
  correct_answer?: string;
}

export interface FillInTheBlanksContentBlock extends ContentBlockBase {
  type: "fill-in-the-blanks";
  textWithBlanks: string;
  acceptableAnswers: string[][];
  wordBank?: string[];
  caseSensitive?: boolean;
}

export interface WritingContentBlock extends ContentBlockBase {
  type: "writing";
  prompt: string;
  minWordCount: number;
  maxWordCount: number;
  guidance?: string;
}

export type StudentResponseType = "text" | "voice" | "audio" | "file";
export type OptionIndexingStyle = "alphabetical" | "numeric" | "none";
export type StudentResponseAllowedType = "text" | "audio" | "file";

export interface StudentResponseConfig {
  enabled: boolean;
  allowedTypes: StudentResponseAllowedType[];
  maxAudioDurationSeconds?: number;
}

export interface ContentBlockBase {
  id: string;
  type: ContentBlockType;
  title: string;
  enabled: boolean;
  is_active?: boolean;
  layoutMode?: "global" | "inline-row";
  sidebarBlockId?: string;
  rowEmptyMode?: "full" | "empty";
  parentMainBlockId?: string;
  hasStudentResponseInput?: boolean;
  studentResponseType?: StudentResponseType;
  allowStudentVoiceResponse?: boolean;
  studentResponseConfig?: StudentResponseConfig;
}

export interface TextContentBlock extends ContentBlockBase {
  type: "text";
  body: string;
}

export interface AudioContentBlock extends ContentBlockBase {
  type: "audio";
  audioUrl: string;
  transcript?: string;
}

export interface VideoContentBlock extends ContentBlockBase {
  type: "video";
  videoUrl: string;
  transcript?: string;
  show_reflection_prompt?: boolean;
  reflection_prompt_text?: string;
}

export interface ImageContentBlock extends ContentBlockBase {
  type: "image";
  imageUrl: string;
  caption: string;
}

export interface ResourceContentBlock extends ContentBlockBase {
  type: "resource";
  resourceUrl: string;
  description?: string;
}

export interface QuizContentBlock extends ContentBlockBase {
  type: "quiz";
  questions: QuizQuestion[];
}

export interface QuestionContentBlock extends ContentBlockBase {
  type: "question";
  prompt: string;
  options: string[];
  correct_answer: string;
  question_type?: "multiple_choice" | "open_ended";
  optionIndexingStyle?: OptionIndexingStyle;
  sample_answer?: string;
}

export type ContentBlock =
  | TextContentBlock
  | AudioContentBlock
  | VideoContentBlock
  | ImageContentBlock
  | ResourceContentBlock
  | QuestionContentBlock
  | QuizContentBlock
  | FillInTheBlanksContentBlock
  | WritingContentBlock;

export type DynamicStepContent = { blocks?: ContentBlock[] };

export interface StepWarmUpContent {
  blocks?: ContentBlock[];
  prompt?: BlockItem;
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
  blocks?: ContentBlock[];
  mainArticle?: BlockItem;
  core_concept?: BlockItem;
  examples?: BlockItem[];
  flexible_exercises?: BlockItem[];
}

export interface StepListeningContent {
  blocks?: ContentBlock[];
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
  blocks?: ContentBlock[];
  mainArticle?: BlockItem;
  article_markdown?: BlockItem;
  lexicon_notes?: BlockItem;
  vocabulary_drawer?: Array<{
    word: string;
    definition: string;
    enabled: boolean;
  }>;
  analytical_questions?: Array<{
    id: string;
    question: string;
    correct_answer?: string;
    enabled: boolean;
  }>;
}

export interface StepWritingContent {
  blocks?: ContentBlock[];
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
  blocks?: ContentBlock[];
  scenario?: BlockItem;
  discussion_points?: BlockItem[];
  delivery_tips?: BlockItem[];
  audio_capture?: {
    enabled: boolean;
    max_duration_seconds?: number;
  };
}

export interface StepResultsContent {
  blocks?: ContentBlock[];
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
  studentId?: StudentId;
  subtitle?: string;
  moduleNumber: number;
  coverImage?: string;
  ambientMusicUrl?: string;
  ambientTracks?: Array<{ title: string; url: string }>;
  instructor?: InstructorProfile;
  studentName?: string;
  status?: "draft" | "published";
  content?: InstructorLessonMock["content"];
}

export interface PublishedLessonState {
  content: StrictStepContent;
  bannerUrl: string;
  studentProfile: StudentProfile;
  evaluation: LessonEvaluation;
  status: "draft" | "published";
  submission?: StudentSubmission;
}

export interface InstructorProfile {
  id?: string;
  fullName: string;
  initials: string;
  avatarUrl?: string;
}

export interface StudentProfile {
  id?: string;
  fullName: string;
  avatarUrl?: string;
  bannerUrl?: string;
  level: string;
  targetGoal: string;
  core_goal?: string;
  learningGoal?: string;
  instructor_notes?: string;
  dashboard_note?: string;
  weaknesses: string[];
  teacherNotes: string;
  attendanceRate: number;
  completedModulesCount: number;
}

export interface InstructorLessonMock {
  id: string;
  title: string;
  module_tag?: string;
  studentName: string;
  banner_image_url?: string;
  bannerUrl?: string;
  moduleNumber?: number;
  instructor?: InstructorProfile;
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

export type StrictStepContent = InstructorLessonMock["content"] & {
  ambientMusicUrl?: string;
  ambientTracks?: Array<{ title: string; url: string }>;
};

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
  writing_responses?: Record<string, string>;
  speakingAudioUrl?: string;
  blockResponses?: Record<string, string>;
  quizSelections?: Record<string, string>;
  audioUploads?: Record<string, string>;
  submittedAt?: string;
}

export interface SavedVocabularyWord {
  word: string;
  partOfSpeech?: string;
  definition: string;
  example?: string;
  pronunciationUrl?: string;
  source: "merriam-webster" | "free-dictionary";
  savedAt: string;
}

export interface StudentNote {
  id: string;
  text: string;
  lessonSlug?: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  tab: "instructor" | "support";
  text: string;
  sender: "student" | "team";
  createdAt: string;
}
