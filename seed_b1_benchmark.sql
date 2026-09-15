-- Fluentia B1 benchmark lesson seed.
-- Run after migrations/001_create_base_schema.sql with Supabase SQL Editor or a service-role connection.
-- Safe to rerun: the fixed lesson/version IDs are updated in place.

INSERT INTO lessons (id, title, subject, grade, status)
VALUES (
  'b1b10001-1001-4001-8001-000000000001',
  'The Architecture of Daily Habits (B1 Intermediate)',
  'English language and communication',
  'B1 Intermediate',
  'published'
)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  subject = EXCLUDED.subject,
  grade = EXCLUDED.grade,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO lesson_versions (id, lesson_id, version_number, changes_summary, content)
VALUES (
  'b1b10002-1002-4002-8002-000000000002',
  'b1b10001-1001-4001-8001-000000000001',
  1,
  'Published B1 benchmark reference lesson with seven-step results review',
  $$
  {
    "id": "b1b10001-1001-4001-8001-000000000001",
    "slug": "the-architecture-of-daily-habits-b1",
    "title": "The Architecture of Daily Habits (B1 Intermediate)",
    "subtitle": "Explore the small choices that make everyday routines easier to build.",
    "moduleNumber": 1,
    "coverImage": "https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=1200&q=80",
    "ambientMusicUrl": "https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3",
    "instructor": { "fullName": "Fluentia Benchmark Team", "initials": "FB" },
    "workflow": [
      { "stepNumber": 1, "id": "warm_up", "label": "Warm-up" },
      { "stepNumber": 2, "id": "lesson", "label": "Lesson" },
      { "stepNumber": 3, "id": "listening", "label": "Listening" },
      { "stepNumber": 4, "id": "reading", "label": "Reading" },
      { "stepNumber": 5, "id": "writing", "label": "Writing" },
      { "stepNumber": 6, "id": "speaking", "label": "Speaking" },
      { "stepNumber": 7, "id": "results", "label": "Results & Instructor Review" }
    ],
    "warm_up": {
      "blocks": [
        { "id": "b1-warm-text", "type": "text", "title": "A routine you know well", "enabled": true, "body": "Think about one thing you do almost every day. When do you usually do it, and how do you feel afterward?" },
        { "id": "b1-warm-audio", "type": "audio", "title": "Listen: Morning routines", "enabled": true, "audioUrl": "https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3" },
        { "id": "b1-warm-question", "type": "question", "title": "Start a discussion", "enabled": true, "prompt": "Which routine would you most like to make easier?", "options": ["Exercise", "Reading", "Preparing for work", "Going to sleep"], "correct_answer": "" }
      ]
    },
    "lesson": {
      "blocks": [
        { "id": "b1-lesson-markdown", "type": "text", "title": "The habit loop", "enabled": true, "body": "# The Habit Loop\n\n## Three simple parts\nA habit often has three parts: a **cue**, a **routine**, and a **reward**. The cue starts the action, the routine is the action itself, and the reward tells your brain that the action was useful.\n\n- Make the cue easy to notice.\n- Keep the routine small at first.\n- Choose a reward that feels meaningful.\n\nSmall changes are usually easier to repeat than dramatic changes." },
        { "id": "b1-lesson-grammar", "type": "text", "title": "Grammar notes: present simple and adverbs", "enabled": true, "body": "We use the **present simple** for regular habits: *I read before bed.* Adverbs such as **usually**, **often**, and **sometimes** show how frequently something happens.\n\nPattern: subject + adverb of frequency + verb.\nExample: *She usually prepares her clothes the night before.*" }
      ]
    },
    "listening": {
      "blocks": [
        { "id": "b1-listen-audio", "type": "audio", "title": "Listen: A practical experiment", "enabled": true, "audioUrl": "https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3" },
        { "id": "b1-listen-vocabulary", "type": "text", "title": "Vocabulary list", "enabled": true, "body": "**cue**: a signal that starts an action\n\n**routine**: an action that you repeat\n\n**reward**: something positive that follows an action\n\n**friction**: something that makes an action harder" }
      ],
      "questions": [
        { "id": "b1-listen-q1", "question": "What does a cue do?", "options": ["It starts an action", "It ends an action", "It makes an action harder"], "correct_answer": "It starts an action", "enabled": true }
      ]
    },
    "reading": {
      "blocks": [
        { "id": "b1-reading-passage", "type": "text", "title": "Design your environment", "enabled": true, "body": "Many people believe that successful habits depend only on strong motivation. In reality, the space around us also matters. A book on a desk is easier to read than a book hidden in a cupboard. A bottle of water beside your computer is easier to use than one in another room.\n\nThese small decisions reduce friction. They do not remove every problem, but they make the first step simpler. Over time, a simple beginning can become a reliable routine." },
        { "id": "b1-reading-image", "type": "image", "title": "A space designed for focus", "enabled": true, "imageUrl": "https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=1200&q=80", "caption": "Look at the objects that make a desired action visible and easy to start." }
      ],
      "analytical_questions": [
        { "id": "b1-reading-q1", "question": "How can a room reduce friction?", "correct_answer": "It can make useful objects visible and easy to reach.", "enabled": true },
        { "id": "b1-reading-q2", "question": "Why is a small beginning useful?", "correct_answer": "A small beginning is easier to repeat and can become a routine.", "enabled": true }
      ]
    },
    "writing": {
      "blocks": [
        { "id": "b1-writing-note", "type": "text", "title": "Instructor note", "enabled": true, "body": "Use clear examples from your own week. Try to use at least three frequency adverbs: usually, often, sometimes, or rarely." }
      ],
      "prompt": { "text": "Write 120-150 words about one daily habit you want to improve. Explain the cue, routine, reward, and one way to reduce friction.", "enabled": true },
      "min_words": 120,
      "target_words": 135,
      "draft_editor": { "enabled": true, "placeholder": "Describe your habit redesign here..." }
    },
    "speaking": {
      "blocks": [
        { "id": "b1-speaking-note", "type": "text", "title": "Instructor note", "enabled": true, "body": "Speak for one to two minutes. Give one example, explain your plan, and finish with the result you hope to see." },
        { "id": "b1-speaking-response", "type": "audio", "title": "Student audio response", "enabled": true, "audioUrl": "" }
      ],
      "scenario": { "text": "Explain your new habit plan to a classmate who wants to build the same routine.", "enabled": true },
      "audio_capture": { "enabled": true, "max_duration_seconds": 120 }
    },
    "results": {
      "stepNumber": 7,
      "stepLabel": "Results & Instructor Review",
      "blocks": [
        { "id": "b1-results-quiz", "type": "quiz", "title": "Benchmark check", "enabled": true, "questions": [
          { "id": "b1-results-q1", "prompt": "Which part of the habit loop starts the action?", "options": ["Cue", "Routine", "Reward"], "correct_answer": "Cue" },
          { "id": "b1-results-q2", "prompt": "What does reducing friction do?", "options": ["It makes an action harder", "It makes an action easier to start", "It removes every problem"], "correct_answer": "It makes an action easier to start" }
        ] },
        { "id": "b1-results-summary", "type": "text", "title": "Summary", "enabled": true, "body": "You learned that habits are shaped by cues, routines, rewards, and the environment. Choose one small change and test it for a week." },
        { "id": "b1-results-feedback", "type": "text", "title": "Instructor feedback", "enabled": true, "body": "Instructor feedback will appear here after your writing and speaking responses are reviewed." }
      ],
      "answer_keys": {
        "listening": { "b1-listen-q1": "It starts an action" },
        "reading": { "b1-reading-q1": "It can make useful objects visible and easy to reach.", "b1-reading-q2": "A small beginning is easier to repeat and can become a routine." },
        "results_quiz": { "b1-results-q1": "Cue", "b1-results-q2": "It makes an action easier to start" }
      },
      "quiz_breakdown": [
        { "questionId": "b1-results-q1", "correctResponse": "Cue", "skill": "Understanding the habit loop" },
        { "questionId": "b1-results-q2", "correctResponse": "It makes an action easier to start", "skill": "Understanding friction" }
      ],
      "feedback_notes": {
        "writing": "Review use of present simple, frequency adverbs, and clear habit vocabulary.",
        "speaking": "Review clarity, organization, pronunciation, and whether the student explains a practical plan.",
        "overall": "Add strengths, one improvement target, and one next-step recommendation after review."
      },
      "unlocked_transcripts": true,
      "self_reflection": { "text": "What small change will you test first?", "enabled": true },
      "instructor_review_card": { "enabled": true, "prompt": "Your instructor will review the writing and speaking responses." },
      "instructor_feedback": { "status": "pending", "strengths": "", "areasToImprove": "", "nextStep": "" }
    }
  }
  $$::jsonb
)
ON CONFLICT (lesson_id, version_number) DO UPDATE SET
  changes_summary = EXCLUDED.changes_summary,
  content = EXCLUDED.content,
  created_at = now();
