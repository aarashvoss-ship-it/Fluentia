-- Instructor and student conversation messages
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id text,
  instructor_id text NOT NULL,
  sender_id text NOT NULL,
  receiver_id text NOT NULL,
  tab_type text NOT NULL CHECK (tab_type IN ('active', 'support')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_messages_student_thread
  ON messages(instructor_id, student_id, tab_type, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_unread
  ON messages(instructor_id, receiver_id, read_at);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Messages are readable by conversation participants"
  ON messages FOR SELECT
  USING (sender_id = auth.uid()::text OR receiver_id = auth.uid()::text);

CREATE POLICY "Conversation participants can send messages"
  ON messages FOR INSERT
  WITH CHECK (sender_id = auth.uid()::text OR receiver_id = auth.uid()::text);

CREATE POLICY "Recipients can mark messages read"
  ON messages FOR UPDATE
  USING (receiver_id = auth.uid()::text)
  WITH CHECK (receiver_id = auth.uid()::text);

ALTER PUBLICATION supabase_realtime ADD TABLE messages;
