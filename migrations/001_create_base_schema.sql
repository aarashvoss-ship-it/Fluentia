-- Fluentia Language Learning Platform - Base Schema Migration
-- This migration creates the core tables for the personalized language learning application

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- Table: lessons
-- ============================================================================
CREATE TABLE IF NOT EXISTS lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  subject text,
  grade text,
  status text DEFAULT 'draft',
  student_id uuid,
  instructor_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes on frequently queried columns
CREATE INDEX IF NOT EXISTS idx_lessons_student_id ON lessons(student_id);
CREATE INDEX IF NOT EXISTS idx_lessons_instructor_id ON lessons(instructor_id);
CREATE INDEX IF NOT EXISTS idx_lessons_status ON lessons(status);
CREATE INDEX IF NOT EXISTS idx_lessons_created_at ON lessons(created_at);

-- ============================================================================
-- Table: lesson_versions
-- ============================================================================
CREATE TABLE IF NOT EXISTS lesson_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL,
  version_number integer NOT NULL,
  content jsonb NOT NULL,
  changes_summary text,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT fk_lesson_versions_lesson_id 
    FOREIGN KEY (lesson_id) 
    REFERENCES lessons(id) 
    ON DELETE CASCADE,
  CONSTRAINT unique_lesson_version 
    UNIQUE(lesson_id, version_number)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_lesson_versions_lesson_id ON lesson_versions(lesson_id);
CREATE INDEX IF NOT EXISTS idx_lesson_versions_version_number ON lesson_versions(version_number);
CREATE INDEX IF NOT EXISTS idx_lesson_versions_created_at ON lesson_versions(created_at);

-- ============================================================================
-- Table: submissions
-- ============================================================================
CREATE TABLE IF NOT EXISTS submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL,
  student_id uuid NOT NULL,
  answers jsonb NOT NULL,
  status text DEFAULT 'submitted',
  submitted_at timestamptz DEFAULT now(),
  CONSTRAINT fk_submissions_lesson_id 
    FOREIGN KEY (lesson_id) 
    REFERENCES lessons(id) 
    ON DELETE CASCADE
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_submissions_lesson_id ON submissions(lesson_id);
CREATE INDEX IF NOT EXISTS idx_submissions_student_id ON submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);
CREATE INDEX IF NOT EXISTS idx_submissions_submitted_at ON submissions(submitted_at);

-- ============================================================================
-- Table: evaluations
-- ============================================================================
CREATE TABLE IF NOT EXISTS evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL,
  instructor_id uuid NOT NULL,
  feedback text,
  score numeric,
  evaluated_at timestamptz DEFAULT now(),
  CONSTRAINT fk_evaluations_submission_id 
    FOREIGN KEY (submission_id) 
    REFERENCES submissions(id) 
    ON DELETE CASCADE
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_evaluations_submission_id ON evaluations(submission_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_instructor_id ON evaluations(instructor_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_evaluated_at ON evaluations(evaluated_at);

-- ============================================================================
-- Table: banners
-- ============================================================================
CREATE TABLE IF NOT EXISTS banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  message text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_banners_is_active ON banners(is_active);
CREATE INDEX IF NOT EXISTS idx_banners_created_at ON banners(created_at);

-- ============================================================================
-- Enable Row Level Security (RLS) on all tables
-- ============================================================================
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE banners ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS Policies for lessons table
-- ============================================================================
-- Allow authenticated users to view their own lessons
CREATE POLICY "Users can view their own lessons" 
  ON lessons 
  FOR SELECT 
  USING (
    auth.uid() = student_id 
    OR auth.uid() = instructor_id
  );

-- Allow authenticated users to create lessons
CREATE POLICY "Users can create lessons" 
  ON lessons 
  FOR INSERT 
  WITH CHECK (auth.role() = 'authenticated');

-- Allow authenticated users to update their own lessons
CREATE POLICY "Users can update their own lessons" 
  ON lessons 
  FOR UPDATE 
  USING (
    auth.uid() = student_id 
    OR auth.uid() = instructor_id
  )
  WITH CHECK (
    auth.uid() = student_id 
    OR auth.uid() = instructor_id
  );

-- Allow authenticated users to delete their own lessons
CREATE POLICY "Users can delete their own lessons" 
  ON lessons 
  FOR DELETE 
  USING (
    auth.uid() = student_id 
    OR auth.uid() = instructor_id
  );

-- ============================================================================
-- RLS Policies for lesson_versions table
-- ============================================================================
-- Allow authenticated users to view lesson versions
CREATE POLICY "Users can view lesson versions" 
  ON lesson_versions 
  FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM lessons 
      WHERE lessons.id = lesson_versions.lesson_id 
      AND (lessons.student_id = auth.uid() OR lessons.instructor_id = auth.uid())
    )
  );

-- Allow authenticated users to create lesson versions
CREATE POLICY "Users can create lesson versions" 
  ON lesson_versions 
  FOR INSERT 
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM lessons 
      WHERE lessons.id = lesson_versions.lesson_id 
      AND (lessons.student_id = auth.uid() OR lessons.instructor_id = auth.uid())
    )
  );

-- Allow authenticated users to update lesson versions
CREATE POLICY "Users can update lesson versions" 
  ON lesson_versions 
  FOR UPDATE 
  USING (
    EXISTS (
      SELECT 1 FROM lessons 
      WHERE lessons.id = lesson_versions.lesson_id 
      AND (lessons.student_id = auth.uid() OR lessons.instructor_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM lessons 
      WHERE lessons.id = lesson_versions.lesson_id 
      AND (lessons.student_id = auth.uid() OR lessons.instructor_id = auth.uid())
    )
  );

-- Allow authenticated users to delete lesson versions
CREATE POLICY "Users can delete lesson versions" 
  ON lesson_versions 
  FOR DELETE 
  USING (
    EXISTS (
      SELECT 1 FROM lessons 
      WHERE lessons.id = lesson_versions.lesson_id 
      AND (lessons.student_id = auth.uid() OR lessons.instructor_id = auth.uid())
    )
  );

-- ============================================================================
-- RLS Policies for submissions table
-- ============================================================================
-- Allow authenticated users to view their own submissions
CREATE POLICY "Users can view their own submissions" 
  ON submissions 
  FOR SELECT 
  USING (
    auth.uid() = student_id 
    OR EXISTS (
      SELECT 1 FROM lessons 
      WHERE lessons.id = submissions.lesson_id 
      AND lessons.instructor_id = auth.uid()
    )
  );

-- Allow authenticated users to create submissions
CREATE POLICY "Users can create submissions" 
  ON submissions 
  FOR INSERT 
  WITH CHECK (auth.role() = 'authenticated');

-- Allow authenticated users to update their own submissions
CREATE POLICY "Users can update their own submissions" 
  ON submissions 
  FOR UPDATE 
  USING (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);

-- Allow authenticated users to delete their own submissions
CREATE POLICY "Users can delete their own submissions" 
  ON submissions 
  FOR DELETE 
  USING (auth.uid() = student_id);

-- ============================================================================
-- RLS Policies for evaluations table
-- ============================================================================
-- Allow authenticated users to view evaluations on their submissions
CREATE POLICY "Users can view evaluations on their submissions" 
  ON evaluations 
  FOR SELECT 
  USING (
    auth.uid() = instructor_id 
    OR EXISTS (
      SELECT 1 FROM submissions 
      WHERE submissions.id = evaluations.submission_id 
      AND submissions.student_id = auth.uid()
    )
  );

-- Allow authenticated users to create evaluations
CREATE POLICY "Users can create evaluations" 
  ON evaluations 
  FOR INSERT 
  WITH CHECK (auth.role() = 'authenticated');

-- Allow authenticated users to update their own evaluations
CREATE POLICY "Users can update their own evaluations" 
  ON evaluations 
  FOR UPDATE 
  USING (auth.uid() = instructor_id)
  WITH CHECK (auth.uid() = instructor_id);

-- Allow authenticated users to delete their own evaluations
CREATE POLICY "Users can delete their own evaluations" 
  ON evaluations 
  FOR DELETE 
  USING (auth.uid() = instructor_id);

-- ============================================================================
-- RLS Policies for banners table
-- ============================================================================
-- Allow all authenticated users to view banners
CREATE POLICY "Authenticated users can view banners" 
  ON banners 
  FOR SELECT 
  USING (auth.role() = 'authenticated');

-- Allow authenticated users to create banners
CREATE POLICY "Authenticated users can create banners" 
  ON banners 
  FOR INSERT 
  WITH CHECK (auth.role() = 'authenticated');

-- Allow authenticated users to update banners
CREATE POLICY "Authenticated users can update banners" 
  ON banners 
  FOR UPDATE 
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Allow authenticated users to delete banners
CREATE POLICY "Authenticated users can delete banners" 
  ON banners 
  FOR DELETE 
  USING (auth.role() = 'authenticated');

-- ============================================================================
-- Migration complete
-- ============================================================================
-- This migration creates the base schema for the Fluentia language learning platform
-- All tables have RLS enabled and policies in place for authenticated users
-- Indexes have been created on frequently queried columns for performance
