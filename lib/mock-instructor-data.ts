import { InstructorLessonMock } from "@/types/lesson";

export const MOCK_INSTRUCTOR_LESSONS: Record<string, InstructorLessonMock> = {
  "habits-01": {
    id: "habits-01",
    title: "The Architecture of Daily Habits",
    module_tag: "module-1",
    studentName: "Arash",
    banner_image_url:
      "https://images.unsplash.com/photo-1506744038136-46273834b3fb",
    studentProfile: {
      id: "student-arash",
      fullName: "Arash",
      level: "B2 Upper Intermediate",
      targetGoal: "Advanced C1 Fluency & Professional Writing",
      weaknesses: [
        "Complex prepositions",
        "Nuanced idioms",
        "Tone consistency",
      ],
      teacherNotes: "Strong active vocabulary; focus on academic connectors.",
      attendanceRate: 95,
      completedModulesCount: 12,
    },
    content: {
      warm_up: {
        quote: {
          text: "We are what we repeatedly do. Excellence, then, is not an act, but a habit.",
          enabled: true,
        },
        intro_narrative: {
          text: "Every morning begins the same way for millions of people — and yet the outcomes of their days diverge dramatically. What separates them is rarely talent or luck. It is architecture.",
          enabled: true,
        },
        media_block: {
          image_url:
            "https://images.unsplash.com/photo-1506744038136-46273834b3fb",
          caption: "The quiet power of a structured morning",
          enabled: true,
        },
        quick_prompts: [
          {
            text: "What is one small habit that shapes your morning?",
            enabled: true,
          },
          {
            text: "Can you think of a habit you stopped — and how it happened?",
            enabled: true,
          },
        ],
        lexicon_notes: {
          text: "architecture (n.) — the deliberate design of a system or environment; friction (n.) — resistance that slows or stops a behavior",
          enabled: true,
        },
      },
      lesson: {
        core_concept: {
          text: "Habits are not acts of willpower — they are outcomes of environmental design. By reducing friction for desired behaviors and increasing it for undesired ones, you shape your own default actions.",
          enabled: true,
        },
        examples: [
          {
            text: "Placing your running shoes by the door lowers the activation energy for exercise.",
            enabled: true,
          },
          {
            text: "Removing social media apps from your phone increases friction against mindless scrolling.",
            enabled: true,
          },
        ],
        flexible_exercises: [
          {
            text: "Identify one habit you want to build. What single environmental change would reduce friction for it?",
            enabled: true,
          },
        ],
      },
      listening: {
        audio_url: "https://cdn.fluentia.app/audio/habits-01-listening.mp3",
        audio_meta: {
          duration_seconds: 210,
          speaker: "Dr. Sarah Connelly",
        },
        transcript: {
          text: "In today's recording, Dr. Connelly walks through three real-world examples of habit architecture — from morning routines to workplace productivity systems.",
          enabled: false,
        },
        questions: [
          {
            id: "l1-q1",
            question: "What does the speaker say is the main driver of habit formation?",
            options: [
              "Motivation",
              "Environmental design",
              "Natural talent",
              "Daily reminders",
            ],
            correct_answer: "Environmental design",
            enabled: true,
          },
          {
            id: "l1-q2",
            question: "Which example does the speaker use to illustrate reduced friction?",
            options: [
              "Waking up earlier",
              "Hiring a coach",
              "Laying out workout clothes the night before",
              "Tracking habits in a journal",
            ],
            correct_answer: "Laying out workout clothes the night before",
            enabled: true,
          },
        ],
      },
      reading: {
        article_markdown: {
          text: "## Friction as Architecture\n\nThe most successful habit builders share one counterintuitive insight: they rely on their environment, not their motivation...",
          enabled: true,
        },
        vocabulary_drawer: [
          {
            word: "activation energy",
            definition: "the minimum effort required to begin a behavior",
            enabled: true,
          },
          {
            word: "default",
            definition:
              "what happens automatically when no active choice is made",
            enabled: true,
          },
        ],
        analytical_questions: [
          {
            id: "r1-q1",
            question:
              "How does the author distinguish between motivation-based and environment-based habit change?",
            enabled: true,
          },
          {
            id: "r1-q2",
            question:
              "What does the phrase 'friction as architecture' suggest about the author's view of personal environments?",
            enabled: true,
          },
        ],
      },
      writing: {
        prompt: {
          text: "Describe a habit you want to build or break. Using the concept of friction, design an environmental change that would make it easier or harder. Explain your reasoning.",
          enabled: true,
        },
        framework_tips: [
          {
            text: "Start by naming the specific behavior, not a vague goal.",
            enabled: true,
          },
          {
            text: "Use cause-and-effect connectors: therefore, as a result, consequently.",
            enabled: true,
          },
          {
            text: "Close with a reflection on whether this change feels sustainable.",
            enabled: true,
          },
        ],
        min_words: 120,
        target_words: 200,
        draft_editor: {
          enabled: true,
          placeholder: "Begin your response here...",
        },
      },
      speaking: {
        scenario: {
          text: "You are advising a friend who wants to read more books but never finds the time. Using what you learned about habit architecture, give them two concrete suggestions.",
          enabled: true,
        },
        discussion_points: [
          {
            text: "What environmental change would you recommend first, and why?",
            enabled: true,
          },
          {
            text: "How would you measure whether the habit is taking hold?",
            enabled: true,
          },
        ],
        delivery_tips: [
          {
            text: "Speak at a natural pace — clarity matters more than speed.",
            enabled: true,
          },
          {
            text: "Use hedging language: 'You might consider...', 'One option could be...'",
            enabled: true,
          },
        ],
        audio_capture: {
          enabled: true,
          max_duration_seconds: 120,
        },
      },
      results: {
        answer_keys: {
          listening: {
            "l1-q1": "Environmental design",
            "l1-q2": "Laying out workout clothes the night before",
          },
          reading: {},
        },
        unlocked_transcripts: true,
        self_reflection: {
          text: "Which part of today's lesson felt most challenging? What is one thing you would like to practice before the next session?",
          enabled: true,
        },
        instructor_review_card: {
          enabled: true,
          prompt:
            "Review the student's writing and speaking submissions. Note vocabulary range, connector use, and argument structure.",
        },
      },
    },
  },
};
