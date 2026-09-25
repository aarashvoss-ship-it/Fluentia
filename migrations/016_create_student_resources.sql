CREATE UNIQUE INDEX IF NOT EXISTS idx_students_id_token
  ON students(id, token);

CREATE TABLE IF NOT EXISTS student_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  student_token text NOT NULL,
  resource_type text NOT NULL CHECK (resource_type IN ('note', 'reading', 'flashcard', 'quiz')),
  title text NOT NULL,
  body text,
  link_url text,
  question text,
  answer text,
  explanation text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_resources_student_identity_fkey
    FOREIGN KEY (student_id, student_token)
    REFERENCES students(id, token)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_student_resources_student_created
  ON student_resources(student_id, created_at DESC);

ALTER TABLE student_resources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students can read their resources" ON student_resources;
CREATE POLICY "Students can read their resources" ON student_resources
FOR SELECT
USING (auth.uid() = student_id);

DROP POLICY IF EXISTS "Instructors can manage student resources" ON student_resources;
CREATE POLICY "Instructors can manage student resources" ON student_resources
FOR ALL
USING (EXISTS (SELECT 1 FROM instructors WHERE instructors.id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM instructors WHERE instructors.id = auth.uid()));