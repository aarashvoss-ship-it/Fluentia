-- Align message payload names with the instructor chat contract.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'channel_type'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'tab_type'
  ) THEN
    ALTER TABLE messages RENAME COLUMN channel_type TO tab_type;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'body'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'content'
  ) THEN
    ALTER TABLE messages RENAME COLUMN body TO content;
  END IF;
END $$;

ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_channel_type_check;
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_tab_type_check;
ALTER TABLE messages ADD CONSTRAINT messages_tab_type_check CHECK (tab_type IN ('active', 'support'));

DROP INDEX IF EXISTS idx_messages_student_thread;
CREATE INDEX IF NOT EXISTS idx_messages_student_thread
  ON messages(instructor_id, student_id, tab_type, created_at);
