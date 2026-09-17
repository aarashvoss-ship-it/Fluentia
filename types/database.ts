export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type StudentId = string;
export type LessonId = string;
export type SubmissionId = string;

export interface Profile {
  id: string;
  email: string;
  name: string;
  role: "student" | "instructor" | "admin";
  token: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Lesson {
  id: LessonId;
  student_id: StudentId | null;
  title: string;
  subtitle?: string | null;
  module_number: number;
  banner_url?: string | null;
  status: "draft" | "published" | "completed" | "archived";
  content: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface Submission {
  id: SubmissionId;
  student_id: StudentId;
  lesson_id: LessonId;
  step_key: string;
  content: Record<string, any>;
  audio_url?: string | null;
  status: "in_progress" | "submitted" | "reviewed";
  submitted_at: string;
  updated_at: string;
}

export interface Feedback {
  id: string;
  submission_id?: SubmissionId | null;
  lesson_id: LessonId;
  student_id: StudentId;
  instructor_id?: string | null;
  score?: number | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface TelemetryEvent {
  id: string;
  student_id?: StudentId | null;
  lesson_id?: LessonId | null;
  event_name: string;
  metadata: Record<string, any>;
  created_at: string;
}

export interface StudentProgress {
  id: string;
  student_id: StudentId;
  lesson_id: LessonId;
  current_step: number;
  completed_steps: number[];
  is_completed: boolean;
  updated_at: string;
}

export interface LessonAssignmentRow {
  lesson_id: LessonId;
  student_id: StudentId;
  assigned_at: string;
  status?: "assigned" | "completed" | "revoked";
}
