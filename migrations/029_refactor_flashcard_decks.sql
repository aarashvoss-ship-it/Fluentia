ALTER TABLE public.student_resources
  DROP CONSTRAINT IF EXISTS student_resources_resource_type_check;

ALTER TABLE public.student_resources
  ADD CONSTRAINT student_resources_resource_type_check
  CHECK (resource_type IN ('note', 'reading', 'flashcard', 'flashcards', 'quiz', 'audio', 'data_table', 'file', 'image', 'video'));

ALTER TABLE public.student_resources
  ADD COLUMN IF NOT EXISTS cards jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.student_resources
  DROP CONSTRAINT IF EXISTS student_resources_cards_array_check;

ALTER TABLE public.student_resources
  ADD CONSTRAINT student_resources_cards_array_check
  CHECK (jsonb_typeof(cards) = 'array');

CREATE TEMP TABLE student_flashcard_deck_migration AS
SELECT
  (array_agg(id ORDER BY created_at, id))[1] AS survivor_id,
  array_agg(id ORDER BY created_at, id) AS resource_ids,
  jsonb_agg(
    jsonb_build_object(
      'id', id,
      'front', question,
      'back', answer,
      'explanation', explanation
    )
    ORDER BY created_at, id
  ) AS cards
FROM public.student_resources
WHERE resource_type = 'flashcard'
  AND question IS NOT NULL
  AND answer IS NOT NULL
GROUP BY student_id, student_token, lesson_id, title;

UPDATE public.student_resources AS resource
SET
  resource_type = 'flashcards',
  type = 'flashcards',
  question = NULL,
  answer = NULL,
  explanation = NULL,
  cards = deck.cards,
  updated_at = now()
FROM student_flashcard_deck_migration AS deck
WHERE resource.id = deck.survivor_id;

DELETE FROM public.student_resources AS resource
USING student_flashcard_deck_migration AS deck
WHERE resource.id = ANY(deck.resource_ids[2:]);

DROP TABLE student_flashcard_deck_migration;

NOTIFY pgrst, 'reload schema';
