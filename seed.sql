-- Fluentia clean database seed
-- Run after migrations/001_create_base_schema.sql.
-- This removes existing lesson content and inserts one complete published lesson.

TRUNCATE TABLE evaluations, submissions, lesson_versions, lessons RESTART IDENTITY CASCADE;

INSERT INTO lessons (id, title, subject, grade, status)
VALUES (
  '11111111-1111-4111-8111-111111111111',
  'The Architecture of Daily Habits',
  'English language and communication',
  'B2 Upper Intermediate',
  'published'
);

INSERT INTO lesson_versions (lesson_id, version_number, changes_summary, content)
VALUES (
  '11111111-1111-4111-8111-111111111111',
  1,
  'Initial seven-step student lesson seed',
  $$
  {
    "id": "11111111-1111-4111-8111-111111111111",
    "slug": "11111111-1111-4111-8111-111111111111",
    "title": "The Architecture of Daily Habits",
    "subtitle": "Understand how cue, routine, reward, and friction shape everyday behavior.",
    "moduleNumber": 1,
    "coverImage": "https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=1200&q=80",
    "instructor": { "fullName": "Your instructor", "initials": "IN" },
    "warm_up": {
      "blocks": [
        { "id": "warm-up-context", "type": "text", "title": "A small choice", "enabled": true, "body": "Think of one routine you repeat without planning. What usually happens immediately before it?" },
        { "id": "warm-up-quiz", "type": "quiz", "title": "Activate your thinking", "enabled": true, "questions": [
          { "id": "warm-up-q1", "prompt": "Which part of a habit usually starts the behavior?", "options": ["Cue", "Reward", "Reflection"], "correctAnswer": "Cue" }
        ] }
      ]
    },
    "lesson": {
      "blocks": [
        { "id": "lesson-core", "type": "text", "title": "The habit loop", "enabled": true, "body": "A cue triggers a routine, and a reward reinforces the loop. To change a habit, make the desired cue obvious, the routine easy, and the reward meaningful." },
        { "id": "lesson-video", "type": "video", "title": "Habit loops in context", "enabled": true, "videoUrl": "https://www.youtube.com/watch?v=5-mTcFGiVzw" }
      ]
    },
    "listening": {
      "blocks": [
        { "id": "listening-audio", "type": "audio", "title": "Listen for the sequence", "enabled": true, "audioUrl": "" },
        { "id": "listening-check", "type": "quiz", "title": "Check your understanding", "enabled": true, "questions": [
          { "id": "listening-q1", "prompt": "What makes a routine easier to repeat?", "options": ["More friction", "A clear cue and low effort", "Avoiding rewards"], "correctAnswer": "A clear cue and low effort" }
        ] }
      ],
      "questions": [
        { "id": "listening-q1", "question": "What makes a routine easier to repeat?", "options": ["More friction", "A clear cue and low effort"], "correct_answer": "A clear cue and low effort", "enabled": true }
      ]
    },
    "reading": {
      "blocks": [
        { "id": "reading-article", "type": "text", "title": "Design beats willpower", "enabled": true, "body": "People often rely on motivation, but the environment around a behavior can be more reliable. Preparing materials, reducing distractions, and choosing a visible cue can turn intention into action." },
        { "id": "reading-image", "type": "image", "title": "Map the environment", "enabled": true, "imageUrl": "https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=1200&q=80", "caption": "Notice which parts of a space invite or interrupt focus." }
      ],
      "analytical_questions": [
        { "id": "reading-q1", "question": "How does the environment reduce the need for willpower?", "correct_answer": "It reduces friction and makes the desired behavior easier to start.", "enabled": true },
        { "id": "reading-q2", "question": "Which change would make the routine more obvious?", "correct_answer": "Place the cue where it is visible at the moment the routine should begin.", "enabled": true }
      ]
    },
    "writing": {
      "blocks": [
        { "id": "writing-plan", "type": "text", "title": "Plan a change", "enabled": true, "body": "Describe one habit you want to build. Name its cue, routine, reward, and one source of friction you can remove." }
      ],
      "prompt": { "text": "Write a 150-200 word habit redesign plan using cue, routine, reward, and friction.", "enabled": true },
      "min_words": 150,
      "target_words": 180,
      "draft_editor": { "enabled": true, "placeholder": "Write your habit redesign plan here..." }
    },
    "speaking": {
      "blocks": [
        { "id": "speaking-scenario", "type": "text", "title": "Explain your redesign", "enabled": true, "body": "Give a two-minute explanation of the habit you redesigned. Include one likely obstacle and how you will respond to it." },
        { "id": "speaking-capture", "type": "audio", "title": "Record your response", "enabled": true, "audioUrl": "" }
      ],
      "scenario": { "text": "Explain your redesigned habit to a friend who wants to try it.", "enabled": true },
      "audio_capture": { "enabled": true, "max_duration_seconds": 120 }
    },
    "results": {
      "blocks": [
        { "id": "results-reflection", "type": "text", "title": "Reflect on your learning", "enabled": true, "body": "Review your answers and note the smallest change you can make this week." }
      ],
      "answer_keys": { "listening": { "listening-q1": "A clear cue and low effort" }, "reading": {} },
      "unlocked_transcripts": true,
      "self_reflection": { "text": "What will you test first, and how will you know it worked?", "enabled": true },
      "instructor_review_card": { "enabled": true, "prompt": "Your instructor will review the writing and speaking responses." }
    }
  }
  $$::jsonb
);
