export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: "student" | "instructor" | "admin";
  token: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Lesson {
  id: string;
  student_id: string;
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
  id: string;
  student_id: string;
  lesson_id: string;
  step_key: string;
  content: Record<string, any>;
  audio_url?: string | null;
  status: "in_progress" | "submitted" | "reviewed";
  submitted_at: string;
  updated_at: string;
}

export interface Feedback {
  id: string;
  submission_id?: string | null;
  lesson_id: string;
  student_id: string;
  instructor_id?: string | null;
  score?: number | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface TelemetryEvent {
  id: string;
  student_id?: string | null;
  lesson_id?: string | null;
  event_name: string;
  metadata: Record<string, any>;
  created_at: string;
}

export interface StudentProgress {
  id: string;
  student_id: string;
  lesson_id: string;
  current_step: number;
  completed_steps: number[];
  is_completed: boolean;
  updated_at: string;
}
