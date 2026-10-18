DO $$
BEGIN
  IF to_regclass('public.submissions_lesson_student_key') IS NULL THEN
    WITH ranked_submissions AS (
      SELECT id, lesson_id, student_id,
             first_value(id) OVER (
               PARTITION BY lesson_id, student_id
               ORDER BY submitted_at DESC, id DESC
             ) AS keep_id
      FROM public.submissions
    ),
    ranked_drafts AS (
      SELECT ranked.keep_id, drafts.lesson_id, drafts.student_id,
             drafts.instructor_id, drafts.evaluation, drafts.updated_at,
             row_number() OVER (
               PARTITION BY ranked.keep_id
               ORDER BY drafts.updated_at DESC, drafts.submission_id
             ) AS draft_rank
      FROM ranked_submissions AS ranked
      JOIN public.instructor_evaluation_drafts AS drafts
        ON drafts.submission_id = ranked.id
    )
    INSERT INTO public.instructor_evaluation_drafts
      (submission_id, lesson_id, student_id, instructor_id, evaluation, updated_at)
    SELECT keep_id, lesson_id, student_id, instructor_id, evaluation, updated_at
    FROM ranked_drafts
    WHERE draft_rank = 1
    ON CONFLICT (submission_id) DO UPDATE
    SET lesson_id = EXCLUDED.lesson_id,
        student_id = EXCLUDED.student_id,
        instructor_id = EXCLUDED.instructor_id,
        evaluation = EXCLUDED.evaluation,
        updated_at = EXCLUDED.updated_at
    WHERE EXCLUDED.updated_at > instructor_evaluation_drafts.updated_at;

    IF to_regclass('public.evaluations') IS NOT NULL THEN
      EXECUTE '
        WITH ranked_submissions AS (
          SELECT id,
                 first_value(id) OVER (
                   PARTITION BY lesson_id, student_id
                   ORDER BY submitted_at DESC, id DESC
                 ) AS keep_id
          FROM public.submissions
        )
        UPDATE public.evaluations AS evaluation
        SET submission_id = ranked.keep_id
        FROM ranked_submissions AS ranked
        WHERE evaluation.submission_id = ranked.id
          AND ranked.id <> ranked.keep_id';
    END IF;

    WITH ranked_submissions AS (
      SELECT id,
             row_number() OVER (
               PARTITION BY lesson_id, student_id
               ORDER BY submitted_at DESC, id DESC
             ) AS submission_rank
      FROM public.submissions
    )
    DELETE FROM public.submissions AS submission
    USING ranked_submissions AS ranked
    WHERE submission.id = ranked.id
      AND ranked.submission_rank > 1;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS submissions_lesson_student_key
  ON public.submissions (lesson_id, student_id);

NOTIFY pgrst, 'reload schema';
