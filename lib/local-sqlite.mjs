import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";

const INSTRUCTOR_ID = "11111111-1111-4111-8111-111111111111";
const STUDENT_ONE_ID = "22222222-2222-4222-8222-222222222222";
const STUDENT_TWO_ID = "33333333-3333-4333-8333-333333333333";
const LESSON_ONE_ID = "b1b10001-1001-4001-8001-000000000001";
const LESSON_TWO_ID = "b2b20002-2002-4002-8002-000000000002";
const SUBMISSION_ONE_ID = "44444444-4444-4444-8444-444444444444";
const SUBMISSION_TWO_ID = "55555555-5555-4555-8555-555555555555";
const DEMO_PASSWORD = process.env.FLUENTIA_LOCAL_DEMO_PASSWORD || "FluentiaLocal!2026";

let databasePromise;

const lessonContent = [
  {
    slug: "the-architecture-of-daily-habits-b1",
    title: "The Architecture of Daily Habits",
    subtitle: "A practical lesson about routines, friction, and sustainable change.",
    moduleNumber: 1,
    warm_up: {
      intro_narrative: { text: "Small changes become easier when the environment supports them.", enabled: true },
      quote: { text: "What habit would you like to make easier?", enabled: true },
    },
    lesson: {
      core_concept: { text: "Design the environment around the behavior you want to repeat.", enabled: true },
      examples: [{ text: "Prepare your running clothes the night before to reduce friction.", enabled: true }],
    },
    listening: { transcript: { text: "Listen for the ideas about cues, friction, and repetition.", enabled: true }, questions: [] },
    reading: { article_markdown: { text: "A reliable routine begins with a clear cue and a manageable first step.", enabled: true }, analytical_questions: [] },
    writing: {
      prompt: { text: "Reflect on a routine you want to improve and describe your next step.", enabled: true },
      blocks: [
        { id: "habit-reflection", type: "writing", title: "Reflection Question", prompt: "Which daily habit would you like to improve, and why?" },
        { id: "habit-action-plan", type: "writing", title: "Actionable Task", prompt: "What is one small action you can take this week to support that habit?" },
      ],
      draft_editor: { enabled: true, placeholder: "Write your response here..." },
    },
    speaking: { scenario: { text: "Explain your habit plan aloud in two or three sentences.", enabled: true }, audio_capture: { enabled: false } },
    results: {},
  },
  {
    slug: "clear-communication-b1",
    title: "Clear Communication at Work",
    subtitle: "Practice concise updates and practical next steps.",
    moduleNumber: 2,
    warm_up: { quote: { text: "What makes a work update easy to understand?", enabled: true } },
    lesson: { core_concept: { text: "Lead with the main point, then give only the context needed to act.", enabled: true } },
    listening: { questions: [] },
    reading: { analytical_questions: [] },
    writing: {
      prompt: { text: "Describe how you would make a project update clearer.", enabled: true },
      blocks: [
        { id: "communication-reflection", type: "writing", title: "Reflection Question", prompt: "What is one communication habit you want to improve?" },
        { id: "communication-action-plan", type: "writing", title: "Actionable Task", prompt: "Write one practical change you will try in your next project update." },
      ],
    },
    speaking: { scenario: { text: "Give a short, clear update about a project.", enabled: true } },
    results: {},
  },
];

const schema = `
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS seed_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('student', 'instructor', 'admin')),
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL,
    level TEXT NOT NULL DEFAULT 'B1',
    target_level TEXT NOT NULL DEFAULT 'B1',
    target_goal TEXT NOT NULL DEFAULT '',
    core_goal TEXT NOT NULL DEFAULT '',
    focus_weaknesses TEXT NOT NULL DEFAULT '[]',
    assigned_instructor TEXT NOT NULL DEFAULT '',
    dashboard_note TEXT NOT NULL DEFAULT '',
    avatar_url TEXT,
    banner_url TEXT,
    avatar_bg_color TEXT,
    avatar_initials TEXT,
    enrolled_date TEXT NOT NULL,
    membership_tier TEXT NOT NULL DEFAULT 'starter',
    credit_balance INTEGER NOT NULL DEFAULT 100,
    credit_limit INTEGER NOT NULL DEFAULT 100,
    show_wallet_widget INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS allowed_users (
    email TEXT PRIMARY KEY COLLATE NOCASE,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS lessons (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    subtitle TEXT NOT NULL,
    module_number INTEGER NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    grade TEXT NOT NULL,
    status TEXT NOT NULL,
    is_published INTEGER NOT NULL,
    is_archived INTEGER NOT NULL DEFAULT 0,
    assigned_all_students INTEGER NOT NULL DEFAULT 0,
    instructor_id TEXT NOT NULL REFERENCES users(id),
    student_id TEXT REFERENCES users(id),
    banner_url TEXT,
    tags TEXT NOT NULL DEFAULT '{}',
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS lesson_versions (
    id TEXT PRIMARY KEY,
    lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    content TEXT NOT NULL,
    changes_summary TEXT,
    created_at TEXT NOT NULL,
    UNIQUE (lesson_id, version_number)
  );
  CREATE TABLE IF NOT EXISTS lesson_assignments (
    lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'assigned',
    assigned_at TEXT NOT NULL,
    PRIMARY KEY (lesson_id, student_id)
  );
  CREATE TABLE IF NOT EXISTS submissions (
    id TEXT PRIMARY KEY,
    lesson_id TEXT NOT NULL REFERENCES lessons(id),
    student_id TEXT NOT NULL REFERENCES users(id),
    answers TEXT NOT NULL,
    status TEXT NOT NULL,
    submitted_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    allow_resubmission INTEGER NOT NULL DEFAULT 0,
    audio_url TEXT,
    UNIQUE (lesson_id, student_id)
  );
  CREATE TABLE IF NOT EXISTS instructor_evaluation_drafts (
    submission_id TEXT PRIMARY KEY REFERENCES submissions(id) ON DELETE CASCADE,
    lesson_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    instructor_id TEXT NOT NULL,
    evaluation TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS instructor_feedback (
    id TEXT PRIMARY KEY,
    lesson_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    instructor_id TEXT NOT NULL,
    evaluation TEXT NOT NULL,
    is_published INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL,
    UNIQUE (lesson_id, student_id)
  );
  CREATE TABLE IF NOT EXISTS student_task_reports (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    module_id TEXT NOT NULL,
    stage_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    report_data TEXT NOT NULL,
    published_content TEXT NOT NULL,
    is_published INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS student_task_reports_lookup
    ON student_task_reports (student_id, module_id, stage_id, task_id, created_at DESC);
  CREATE TABLE IF NOT EXISTS academis_evaluation_insights (
    id TEXT PRIMARY KEY,
    submission_id TEXT NOT NULL,
    lesson_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    instructor_id TEXT NOT NULL,
    stage_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    score REAL,
    insights TEXT NOT NULL,
    model TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS academis_insights_lookup
    ON academis_evaluation_insights (submission_id, stage_id, task_id, created_at DESC);
  CREATE TABLE IF NOT EXISTS academis_prompt_libraries (
    instructor_id TEXT PRIMARY KEY,
    library TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`;

function isoNow() {
  return new Date().toISOString();
}

function json(value) {
  return JSON.stringify(value);
}

function parseJson(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

async function openDatabase() {
  const { DatabaseSync } = await import("node:sqlite");
  const filePath = process.env.FLUENTIA_LOCAL_DB_PATH
    ? path.resolve(process.env.FLUENTIA_LOCAL_DB_PATH)
    : path.resolve(process.cwd(), "data", "fluentia.local.sqlite");
  mkdirSync(path.dirname(filePath), { recursive: true });
  const database = new DatabaseSync(filePath);
  database.exec(schema);
  seedDemoData(database);
  return database;
}

function seedDemoData(database) {
  if (database.prepare("SELECT value FROM seed_meta WHERE key = ?").get("demo-seed-v1")) return;

  const timestamp = isoNow();
  const date = timestamp.slice(0, 10);
  const passwordHash = bcrypt.hashSync(DEMO_PASSWORD, 10);
  const insertUser = database.prepare(
    "INSERT OR IGNORE INTO users (id, email, password_hash, role, name, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const insertProfile = database.prepare(
    `INSERT OR IGNORE INTO profiles
      (id, token, full_name, email, role, level, target_level, target_goal, core_goal,
       focus_weaknesses, assigned_instructor, enrolled_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertLesson = database.prepare(
    `INSERT OR IGNORE INTO lessons
      (id, title, subtitle, module_number, slug, grade, status, is_published,
       assigned_all_students, instructor_id, student_id, tags, content, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'B1', 'published', 1, 0, ?, ?, ?, ?, ?, ?)`,
  );
  const insertVersion = database.prepare(
    `INSERT OR IGNORE INTO lesson_versions
      (id, lesson_id, version_number, content, changes_summary, created_at)
     VALUES (?, ?, 1, ?, 'Local demo lesson', ?)`,
  );
  const insertAssignment = database.prepare(
    "INSERT OR IGNORE INTO lesson_assignments (lesson_id, student_id, status, assigned_at) VALUES (?, ?, 'assigned', ?)",
  );
  const insertSubmission = database.prepare(
    `INSERT OR IGNORE INTO submissions
      (id, lesson_id, student_id, answers, status, submitted_at, updated_at)
     VALUES (?, ?, ?, ?, 'submitted', ?, ?)`,
  );
  const insertAllowedUser = database.prepare(
    "INSERT OR IGNORE INTO allowed_users (email, created_at) VALUES (?, ?)",
  );

  database.exec("BEGIN");
  try {
    const accounts = [
      [INSTRUCTOR_ID, "instructor@fluentia.local", "Fluentia Demo Instructor", "instructor", "B2", "", "[]"],
      [STUDENT_ONE_ID, "student.one@fluentia.local", "Jamie Rivers", "student", "B1", "Build confidence in written English.", '["cohesion", "article use"]'],
      [STUDENT_TWO_ID, "student.two@fluentia.local", "Taylor Morgan", "student", "B1", "Communicate clearly at work.", '["sentence variety", "precision"]'],
    ];
    for (const [id, email, name, role, level, goal, weaknesses] of accounts) {
      insertUser.run(id, email, passwordHash, role, name, timestamp);
      insertProfile.run(
        id,
        `local-${id}`,
        name,
        email,
        role,
        level,
        level,
        goal,
        goal,
        weaknesses,
        role === "student" ? "Fluentia Demo Instructor" : "",
        date,
      );
      insertAllowedUser.run(email, timestamp);
    }

    const lessons = [
      {
        id: LESSON_ONE_ID,
        studentId: STUDENT_ONE_ID,
        content: lessonContent[0],
        answers: {
          writing_responses: {
            "habit-reflection": "I want to read more often because it helps me relax and learn new vocabulary.",
            "habit-action-plan": "I will leave a book beside my coffee mug and read for ten minutes after breakfast.",
          },
        },
      },
      {
        id: LESSON_TWO_ID,
        studentId: STUDENT_TWO_ID,
        content: lessonContent[1],
        answers: {
          writing_responses: {
            "communication-reflection": "I sometimes include too much background before explaining my main point.",
            "communication-action-plan": "In my next update, I will start with the decision needed and add only two key details.",
          },
        },
      },
    ];
    for (let index = 0; index < lessons.length; index += 1) {
      const lesson = lessons[index];
      insertLesson.run(
        lesson.id,
        lesson.content.title,
        lesson.content.subtitle,
        index + 1,
        lesson.content.slug,
        INSTRUCTOR_ID,
        lesson.studentId,
        json({ domain: "Communication", skill_focus: "Writing", practice_type: "Guided practice", custom: [] }),
        json(lesson.content),
        timestamp,
        timestamp,
      );
      insertVersion.run(randomUUID(), lesson.id, json(lesson.content), timestamp);
      insertAssignment.run(lesson.id, lesson.studentId, timestamp);
      insertSubmission.run(
        index === 0 ? SUBMISSION_ONE_ID : SUBMISSION_TWO_ID,
        lesson.id,
        lesson.studentId,
        json(lesson.answers),
        timestamp,
        timestamp,
      );
    }
    database.prepare("INSERT INTO seed_meta (key, value) VALUES (?, ?)").run("demo-seed-v1", timestamp);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export async function initializeLocalSqlite() {
  await getLocalDatabase();
}

export async function getLocalDatabase() {
  if (!databasePromise) {
    databasePromise = openDatabase().catch((error) => {
      databasePromise = undefined;
      throw error;
    });
  }
  return databasePromise;
}

export async function closeLocalDatabase() {
  if (!databasePromise) return;
  const database = await databasePromise;
  database.close();
  databasePromise = undefined;
}

export async function findLocalUserByEmail(email) {
  const database = await getLocalDatabase();
  return database.prepare(
    `SELECT users.id, users.email, users.password_hash, users.role, users.name,
            profiles.token, profiles.level, profiles.target_level
     FROM users LEFT JOIN profiles ON profiles.id = users.id
     WHERE lower(users.email) = lower(?) LIMIT 1`,
  ).get(email);
}

export async function createLocalUser(user) {
  const database = await getLocalDatabase();
  const timestamp = isoNow();
  const date = timestamp.slice(0, 10);
  const insert = database.prepare(
    `INSERT INTO users (id, email, password_hash, role, name, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  database.exec("BEGIN");
  try {
    insert.run(user.id, user.email, user.passwordHash, user.role, user.name, timestamp);
    database.prepare(
    `INSERT INTO profiles
      (id, token, full_name, email, role, level, target_level, enrolled_date)
     VALUES (?, ?, ?, ?, ?, 'B1', 'B1', ?)`,
    ).run(user.id, user.token, user.name, user.email, user.role, date);
    database.prepare("INSERT OR IGNORE INTO allowed_users (email, created_at) VALUES (?, ?)").run(user.email, timestamp);
    database.exec("COMMIT");
    return true;
  } catch (error) {
    database.exec("ROLLBACK");
    if (error?.errcode === 2067) return false;
    throw error;
  }
}

export async function getLocalStudents() {
  const database = await getLocalDatabase();
  return database.prepare(
    `SELECT users.id, users.email, users.created_at, profiles.token, profiles.full_name,
            profiles.level, profiles.target_level, profiles.target_goal, profiles.core_goal,
            profiles.focus_weaknesses, profiles.assigned_instructor, profiles.dashboard_note,
            profiles.avatar_url, profiles.banner_url, profiles.avatar_bg_color, profiles.avatar_initials,
            profiles.membership_tier, profiles.credit_balance, profiles.credit_limit,
            profiles.show_wallet_widget, profiles.enrolled_date
     FROM users JOIN profiles ON profiles.id = users.id
     WHERE profiles.role = 'student'
     ORDER BY profiles.full_name`,
  ).all().map((row) => ({
    ...row,
    focus_weaknesses: parseJson(row.focus_weaknesses, []),
    credit_balance: Number(row.credit_balance),
    credit_limit: Number(row.credit_limit),
    show_wallet_widget: Boolean(row.show_wallet_widget),
  }));
}

function mapLocalLesson(row) {
  const content = parseJson(row.content, {});
  const version = row.version_id ? {
    id: row.version_id,
    lesson_id: row.id,
    version_number: row.version_number,
    content: parseJson(row.version_content, content),
    changes_summary: row.changes_summary,
    created_at: row.version_created_at,
  } : undefined;
  return {
    ...row,
    is_published: Boolean(row.is_published),
    is_archived: Boolean(row.is_archived),
    assigned_all_students: Boolean(row.assigned_all_students),
    content,
    current_version: version,
    assigned_student_ids: row.assigned_student_ids || [],
    current_lesson_resources: [],
    track_name: "Local demo",
    track_is_archived: false,
  };
}

export async function getLocalLessons({ scope = "all", user, identity = "", instructorId = "" }) {
  const database = await getLocalDatabase();
  const rows = database.prepare(
    `SELECT lessons.*, versions.id AS version_id, versions.version_number,
            versions.content AS version_content, versions.changes_summary,
            versions.created_at AS version_created_at
     FROM lessons
     LEFT JOIN lesson_versions AS versions
       ON versions.lesson_id = lessons.id AND versions.version_number = (
         SELECT MAX(version_number) FROM lesson_versions WHERE lesson_id = lessons.id
       )
     ORDER BY lessons.created_at DESC`,
  ).all().map(mapLocalLesson);

  if (scope === "versions") {
    return database.prepare(
      `SELECT id, lesson_id, version_number, content, changes_summary, created_at
       FROM lesson_versions WHERE lesson_id = ? ORDER BY version_number ASC`,
    ).all(identity).map((row) => ({ ...row, content: parseJson(row.content, {}) }));
  }
  if (scope === "one") {
    const lesson = rows.find((row) => row.id === identity || row.slug === identity || row.content.slug === identity);
    if (!lesson) return [];
    if (user.role === "instructor" && lesson.instructor_id !== user.id) return [];
    if (user.role === "admin") return [lesson];
    if (user.role === "student"
      && !lesson.assigned_student_ids.includes(user.id)
      && lesson.student_id !== user.id) return [];
    return [lesson];
  }
  if (scope === "student") {
    const studentId = identity || user.id;
    if (user.role === "student" && studentId !== user.id) return [];
    return rows.filter((lesson) => (lesson.status === "published" || lesson.is_published)
      && !lesson.is_archived
      && (lesson.student_id === studentId
        || lesson.assigned_all_students
        || lesson.assigned_student_ids.includes(studentId)));
  }
  if (scope === "instructor") {
    const requestedInstructorId = instructorId || user.id;
    if (user.role !== "admin" && requestedInstructorId !== user.id) return [];
    return rows.filter((lesson) => lesson.instructor_id === requestedInstructorId);
  }
  return rows.filter((lesson) => user.role === "admin" || lesson.instructor_id === user.id);
}

export async function getLocalSubmission(submissionId) {
  const database = await getLocalDatabase();
  const row = database.prepare(
    `SELECT submissions.id, submissions.lesson_id, submissions.student_id, submissions.answers,
            submissions.status, submissions.submitted_at, submissions.updated_at,
            submissions.allow_resubmission, submissions.audio_url, lessons.instructor_id
     FROM submissions JOIN lessons ON lessons.id = submissions.lesson_id
     WHERE submissions.id = ?`,
  ).get(submissionId);
  return row ? {
    ...row,
    answers: parseJson(row.answers, {}),
    allow_resubmission: Boolean(row.allow_resubmission),
  } : null;
}

export async function getLocalSubmissions({ user, lessonId = "", studentId = "", submissionId = "" }) {
  const database = await getLocalDatabase();
  let rows = database.prepare(
    `SELECT submissions.id, submissions.lesson_id, submissions.student_id, submissions.answers,
            submissions.status, submissions.submitted_at, submissions.updated_at,
            submissions.allow_resubmission, submissions.audio_url, lessons.instructor_id
     FROM submissions JOIN lessons ON lessons.id = submissions.lesson_id
     ORDER BY submissions.submitted_at DESC`,
  ).all();
  rows = rows.filter((row) => {
    if (submissionId && row.id !== submissionId) return false;
    if (lessonId && row.lesson_id !== lessonId) return false;
    if (studentId && row.student_id !== studentId) return false;
    if (user.role === "admin") return true;
    if (user.role === "instructor") return row.instructor_id === user.id;
    return row.student_id === user.id;
  });
  return rows.map((row) => ({
    ...row,
    answers: parseJson(row.answers, {}),
    allow_resubmission: Boolean(row.allow_resubmission),
  }));
}

export async function updateLocalSubmission(id, updates) {
  const database = await getLocalDatabase();
  const fields = [];
  const values = [];
  if (updates.answers !== undefined) {
    fields.push("answers = ?");
    values.push(json(updates.answers));
  }
  if (updates.status !== undefined) {
    fields.push("status = ?");
    values.push(updates.status);
  }
  if (updates.allow_resubmission !== undefined) {
    fields.push("allow_resubmission = ?");
    values.push(updates.allow_resubmission ? 1 : 0);
  }
  if (!fields.length) return getLocalSubmission(id);
  fields.push("updated_at = ?");
  values.push(isoNow(), id);
  database.prepare(`UPDATE submissions SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  return getLocalSubmission(id);
}

export async function saveLocalStudentSubmission({ lessonId, studentId, answers, status }) {
  const database = await getLocalDatabase();
  const existing = database.prepare(
    "SELECT id, status, submitted_at, allow_resubmission FROM submissions WHERE lesson_id = ? AND student_id = ?",
  ).get(lessonId, studentId);
  const finalStatuses = ["submitted", "pending_evaluation", "completed", "reviewed", "evaluated"];
  if (existing && finalStatuses.includes(existing.status) && !existing.allow_resubmission) return null;

  const timestamp = isoNow();
  const nextStatus = existing && finalStatuses.includes(existing.status)
    && existing.allow_resubmission && ["draft", "not_started", "in_progress"].includes(status)
    ? existing.status
    : status;
  const submittedAt = existing && finalStatuses.includes(existing.status)
    && existing.allow_resubmission && ["draft", "not_started", "in_progress"].includes(status)
    ? existing.submitted_at
    : timestamp;
  const id = existing?.id || randomUUID();
  database.prepare(
    `INSERT INTO submissions
      (id, lesson_id, student_id, answers, status, submitted_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(lesson_id, student_id) DO UPDATE SET
       answers = excluded.answers, status = excluded.status,
       submitted_at = excluded.submitted_at, updated_at = excluded.updated_at`,
  ).run(id, lessonId, studentId, json(answers), nextStatus, submittedAt, timestamp);
  return getLocalSubmission(id);
}

export async function getLocalInstructorSummary(user) {
  const database = await getLocalDatabase();
  const submissions = await getLocalSubmissions({ user });
  const lessons = database.prepare(
    "SELECT status, is_published FROM lessons WHERE instructor_id = ?",
  ).all(user.id);
  return {
    submissions: submissions.filter((submission) => [
      "submitted", "pending_evaluation", "completed", "reviewed", "evaluated",
    ].includes(submission.status)),
    publishedLessonCount: lessons.filter((lesson) => lesson.status === "published" || lesson.is_published).length,
    draftLessonCount: lessons.filter((lesson) => lesson.status === "draft" && !lesson.is_published).length,
  };
}

export async function saveLocalEvaluation({ submission, instructorId, evaluation, published = false }) {
  const database = await getLocalDatabase();
  const timestamp = isoNow();
  const savedEvaluation = { ...evaluation, published };
  if (!published) {
    database.prepare(
      `INSERT INTO instructor_evaluation_drafts
        (submission_id, lesson_id, student_id, instructor_id, evaluation, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(submission_id) DO UPDATE SET
         lesson_id = excluded.lesson_id, student_id = excluded.student_id,
         instructor_id = excluded.instructor_id, evaluation = excluded.evaluation,
         updated_at = excluded.updated_at`,
    ).run(submission.id, submission.lesson_id, submission.student_id, instructorId, json(savedEvaluation), timestamp);
    return savedEvaluation;
  }
  const recordId = randomUUID();
  database.exec("BEGIN");
  try {
    database.prepare(
      `INSERT INTO instructor_feedback
        (id, lesson_id, student_id, instructor_id, evaluation, is_published, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?)
       ON CONFLICT(lesson_id, student_id) DO UPDATE SET
         instructor_id = excluded.instructor_id, evaluation = excluded.evaluation,
         is_published = 1, updated_at = excluded.updated_at`,
    ).run(recordId, submission.lesson_id, submission.student_id, instructorId, json(savedEvaluation), timestamp);
    database.prepare("DELETE FROM instructor_evaluation_drafts WHERE submission_id = ?").run(submission.id);
    database.prepare("UPDATE submissions SET status = 'evaluated', updated_at = ? WHERE id = ?").run(timestamp, submission.id);
    database.exec("COMMIT");
    return savedEvaluation;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export async function getLocalEvaluation(submission) {
  const database = await getLocalDatabase();
  const draft = database.prepare(
    "SELECT evaluation FROM instructor_evaluation_drafts WHERE submission_id = ?",
  ).get(submission.id);
  const published = database.prepare(
    `SELECT id, instructor_id, evaluation, updated_at FROM instructor_feedback
     WHERE lesson_id = ? AND student_id = ? AND is_published = 1`,
  ).get(submission.lesson_id, submission.student_id);
  const publishedEvaluation = published ? {
    ...parseJson(published.evaluation, {}),
    id: published.id,
    submission_id: submission.id,
    instructor_id: published.instructor_id,
    evaluated_at: published.updated_at,
    published: true,
  } : null;
  return {
    draftEvaluation: draft ? parseJson(draft.evaluation, null) : null,
    publishedEvaluation,
    publishedFeedback: publishedEvaluation,
    evaluation: publishedEvaluation,
    evaluations: publishedEvaluation ? [publishedEvaluation] : [],
  };
}

export async function saveLocalAcademisReport({ submission, instructorId, stageId, taskId, reportData, publishedContent, insight, model }) {
  const database = await getLocalDatabase();
  const timestamp = isoNow();
  const reportId = randomUUID();
  database.exec("BEGIN");
  try {
    database.prepare(
      `INSERT INTO student_task_reports
        (id, student_id, module_id, stage_id, task_id, report_data, published_content, is_published, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    ).run(reportId, submission.student_id, submission.lesson_id, stageId, taskId, json(reportData), json(publishedContent), timestamp, timestamp);
    if (insight) {
      database.prepare(
        `INSERT INTO academis_evaluation_insights
          (id, submission_id, lesson_id, student_id, instructor_id, stage_id, task_id, score, insights, model, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        randomUUID(),
        submission.id,
        submission.lesson_id,
        submission.student_id,
        instructorId,
        stageId,
        taskId,
        insight.overall_band_score,
        json({ ...insight, used_model: model, tier: reportData.tier }),
        model,
        timestamp,
      );
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  return { id: reportId, created_at: timestamp };
}

export async function getLocalAcademisReports({ submission, stageId, taskId }) {
  const database = await getLocalDatabase();
  const rows = database.prepare(
    `SELECT id, task_id, report_data, published_content, is_published, created_at
     FROM student_task_reports
     WHERE student_id = ? AND module_id = ? AND stage_id = ?
       AND json_extract(report_data, '$.submission_id') = ?
     ORDER BY created_at DESC`,
  ).all(submission.student_id, submission.lesson_id, stageId, submission.id);
  const insights = database.prepare(
    `SELECT task_id, insights, created_at FROM academis_evaluation_insights
     WHERE submission_id = ? AND stage_id = ? ORDER BY created_at DESC`,
  ).all(submission.id, stageId);
  const latestInsights = new Map();
  for (const insight of insights) {
    if (!latestInsights.has(insight.task_id)) latestInsights.set(insight.task_id, insight);
  }
  const reportsByTask = new Map();
  for (const row of rows) {
    if (reportsByTask.has(row.task_id)) continue;
    const legacy = latestInsights.get(row.task_id);
    const report = {
      id: row.id,
      report_data: parseJson(row.report_data, {}),
      published_content: parseJson(row.published_content, {}),
      is_published: Boolean(row.is_published),
      created_at: row.created_at,
    };
    reportsByTask.set(row.task_id, {
      taskId: row.task_id,
      insight: legacy ? parseJson(legacy.insights, null) : null,
      report,
      created_at: row.created_at,
    });
  }
  if (taskId !== null) {
    const selected = rows.find((row) => row.task_id === taskId);
    if (!selected) return { insight: latestInsights.has(taskId) ? parseJson(latestInsights.get(taskId).insights, null) : null, report: null };
    const insight = latestInsights.has(taskId) ? parseJson(latestInsights.get(taskId).insights, null) : null;
    return {
      insight,
      report: {
        id: selected.id,
        report_data: parseJson(selected.report_data, {}),
        published_content: parseJson(selected.published_content, {}),
        is_published: Boolean(selected.is_published),
        created_at: selected.created_at,
      },
    };
  }
  const ordered = [...reportsByTask.values()].sort((left, right) => right.created_at.localeCompare(left.created_at));
  return {
    insight: ordered[0]?.insight || null,
    insights: ordered.map(({ created_at, ...report }) => report),
  };
}

export async function publishLocalAcademisReport({ reportId, instructorId, publishedContent }) {
  const database = await getLocalDatabase();
  const result = database.prepare(
    `UPDATE student_task_reports SET published_content = ?, is_published = 1, updated_at = ?
     WHERE id = ? AND module_id IN (SELECT id FROM lessons WHERE instructor_id = ?)
     RETURNING id, student_id, module_id, stage_id, task_id, published_content, is_published, updated_at`,
  ).get(json(publishedContent), isoNow(), reportId, instructorId);
  return result ? {
    ...result,
    published_content: parseJson(result.published_content, {}),
    is_published: Boolean(result.is_published),
  } : null;
}

export async function getLocalPromptLibrary(instructorId) {
  const database = await getLocalDatabase();
  const row = database.prepare(
    "SELECT library FROM academis_prompt_libraries WHERE instructor_id = ?",
  ).get(instructorId);
  return row ? parseJson(row.library, null) : null;
}

export async function saveLocalPromptLibrary(instructorId, library) {
  const database = await getLocalDatabase();
  database.prepare(
    `INSERT INTO academis_prompt_libraries (instructor_id, library, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(instructor_id) DO UPDATE SET library = excluded.library, updated_at = excluded.updated_at`,
  ).run(instructorId, json(library), isoNow());
}

export async function deleteLocalPromptLibraryPreset(instructorId, presetId) {
  const library = await getLocalPromptLibrary(instructorId);
  if (!library) return null;
  const presets = library.presets.filter((preset) => preset.id !== presetId);
  if (presets.length === library.presets.length) return null;
  const updated = { ...library, presets };
  await saveLocalPromptLibrary(instructorId, updated);
  return updated;
}
