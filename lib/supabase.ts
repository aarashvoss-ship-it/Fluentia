import { createClient } from "@supabase/supabase-js";
import type { LessonId, StudentId, SubmissionId } from "@/types/database";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

export const isSupabaseConfigured = () => {
	return Boolean(
		process.env.NEXT_PUBLIC_SUPABASE_URL &&
		process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
	);
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Type definitions for database tables
export interface LessonRow {
	id: LessonId;
	title: string;
	subtitle?: string | null;
	module_number?: number | null;
	banner_url?: string | null;
	slug?: string | null;
	subject: string | null;
	grade: string | null;
	status: "draft" | "published" | "evaluated";
	student_id: StudentId | null;
	/** @deprecated Use student_id and auth.uid() instead. */
	student_token?: string | null;
	instructor_id: string | null;
	created_at: string;
	updated_at: string;
}

export interface LessonVersionRow {
	id: string;
	lesson_id: string;
	version_number: number;
	content: Record<string, any>;
	changes_summary: string | null;
	created_at: string;
}

export interface AmbientTrackRow {
	id: string;
	title: string;
	url: string;
	sort_order: number;
	is_active: boolean;
	created_at: string;
}

export interface SubmissionRow {
	id: SubmissionId;
	lesson_id: LessonId;
	student_id: StudentId;
	answers: Record<string, any>;
	status: "submitted" | "in_progress" | "reviewed";
	submitted_at: string;
}

export interface EvaluationRow {
	id: string;
	submission_id: string;
	instructor_id: string;
	feedback: string | null;
	score: number | null;
	evaluated_at: string;
}

export interface BannerRow {
	id: string;
	title: string;
	message: string;
	is_active: boolean;
	created_at: string;
}
