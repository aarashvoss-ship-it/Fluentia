import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import bcrypt from "bcryptjs";

const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "fluentia-local-db-"));
process.env.FLUENTIA_LOCAL_DB_PATH = path.join(tempDirectory, "local.sqlite");

const {
  closeLocalDatabase,
  createLocalUser,
  findLocalUserByEmail,
  getLocalAcademisReports,
  getLocalDatabase,
  getLocalEvaluation,
  getLocalInstructorSummary,
  getLocalLessons,
  getLocalStudents,
  getLocalSubmission,
  getLocalSubmissions,
  initializeLocalSqlite,
  publishLocalAcademisReport,
  saveLocalAcademisReport,
  saveLocalEvaluation,
} = await import("../lib/local-sqlite.mjs");

test("local SQLite seeds demo data, preserves drafts, and stores ACADEMIS reports", async () => {
  try {
    await initializeLocalSqlite();

    const instructor = await findLocalUserByEmail("instructor@fluentia.local");
    assert.ok(instructor);
    assert.equal(instructor.role, "instructor");
    assert.equal(await bcrypt.compare("FluentiaLocal!2026", instructor.password_hash), true);

    const students = await getLocalStudents();
    assert.equal(students.length, 2);
    const lessons = await getLocalLessons({ scope: "all", user: instructor });
    assert.equal(lessons.length, 2);
    assert.ok(lessons.every((lesson) => Array.isArray(lesson.assigned_student_ids)));

    const summary = await getLocalInstructorSummary(instructor);
    assert.equal(summary.submissions.length, 2);
    const submissions = await getLocalSubmissions({ user: instructor });
    assert.equal(submissions.length, 2);
    const submission = await getLocalSubmission(submissions[0].id);
    assert.ok(submission);

    const evaluation = {
      comments: "Instructor draft",
      totalScore: 76,
      scores: { writing: 76 },
      taskAnswerOverrides: { "habit-reflection": "Corrected answer" },
      taskOverrideAudit: { "habit-reflection": { fields: ["studentAnswer"], editedAt: new Date().toISOString() } },
    };
    await saveLocalEvaluation({ submission, instructorId: instructor.id, evaluation });
    await closeLocalDatabase();

    const reopenedSubmission = await getLocalSubmission(submission.id);
    const reopenedEvaluation = await getLocalEvaluation(reopenedSubmission);
    assert.equal(reopenedEvaluation.draftEvaluation.totalScore, 76);
    assert.deepEqual(reopenedEvaluation.draftEvaluation.taskAnswerOverrides, evaluation.taskAnswerOverrides);

    const insight = {
      criteria_scores: { "Task Achievement": 72, "Coherence": 76 },
      overall_band_score: 74,
      student_summary: "A clear response.",
      instructor_diagnostic: { stage_summary_diagnostic: "", key_error_patterns: [], targeted_resources: [], teaching_notes: "" },
    };
    const report = await saveLocalAcademisReport({
      submission: reopenedSubmission,
      instructorId: instructor.id,
      stageId: "writing",
      taskId: "habit-reflection",
      reportData: { submission_id: submission.id, used_model: "google/gemini-2.5-flash", tier: "free" },
      publishedContent: { format: "markdown_table", rows: [] },
      insight,
      model: "google/gemini-2.5-flash",
    });
    const reportList = await getLocalAcademisReports({ submission: reopenedSubmission, stageId: "writing", taskId: null });
    assert.equal(reportList.insights[0].report.id, report.id);
    assert.equal(reportList.insights[0].report.report_data.tier, "free");

    const published = await publishLocalAcademisReport({
      reportId: report.id,
      instructorId: instructor.id,
      publishedContent: { format: "markdown_table", rows: [["Published"]] },
    });
    assert.equal(published.is_published, true);
    assert.deepEqual(published.published_content.rows, [["Published"]]);

    const created = await createLocalUser({
      id: "66666666-6666-4666-8666-666666666666",
      email: "new.student@fluentia.local",
      passwordHash: instructor.password_hash,
      role: "student",
      name: "New Local Student",
      token: "local-new-student",
    });
    assert.equal(created, true);
    assert.equal(await createLocalUser({
      id: "77777777-7777-4777-8777-777777777777",
      email: "new.student@fluentia.local",
      passwordHash: instructor.password_hash,
      role: "student",
      name: "Duplicate",
      token: "local-duplicate",
    }), false);
  } finally {
    await closeLocalDatabase();
    await rm(tempDirectory, { recursive: true, force: true });
  }
});
