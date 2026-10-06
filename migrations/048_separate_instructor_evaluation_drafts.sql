CREATE TABLE IF NOT EXISTS public.instructor_evaluation_drafts (
  submission_id uuid PRIMARY KEY REFERENCES public.submissions(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  instructor_id uuid NOT NULL,
  evaluation jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.instructor_evaluation_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Instructors can read their evaluation drafts" ON public.instructor_evaluation_drafts;
DROP POLICY IF EXISTS "Instructors can insert their evaluation drafts" ON public.instructor_evaluation_drafts;
DROP POLICY IF EXISTS "Instructors can update their evaluation drafts" ON public.instructor_evaluation_drafts;
DROP POLICY IF EXISTS "Instructors can delete their evaluation drafts" ON public.instructor_evaluation_drafts;

CREATE POLICY "Instructors can read their evaluation drafts"
ON public.instructor_evaluation_drafts
FOR SELECT
TO authenticated
USING (
  auth.uid() = instructor_id
  AND EXISTS (
    SELECT 1
    FROM public.lessons
    WHERE lessons.id::text = instructor_evaluation_drafts.lesson_id::text
      AND lessons.instructor_id::text = auth.uid()::text
  )
);

CREATE POLICY "Instructors can insert their evaluation drafts"
ON public.instructor_evaluation_drafts
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = instructor_id
  AND EXISTS (
    SELECT 1
    FROM public.lessons
    WHERE lessons.id::text = instructor_evaluation_drafts.lesson_id::text
      AND lessons.instructor_id::text = auth.uid()::text
  )
);

CREATE POLICY "Instructors can update their evaluation drafts"
ON public.instructor_evaluation_drafts
FOR UPDATE
TO authenticated
USING (
  auth.uid() = instructor_id
  AND EXISTS (
    SELECT 1
    FROM public.lessons
    WHERE lessons.id::text = instructor_evaluation_drafts.lesson_id::text
      AND lessons.instructor_id::text = auth.uid()::text
  )
)
WITH CHECK (
  auth.uid() = instructor_id
  AND EXISTS (
    SELECT 1
    FROM public.lessons
    WHERE lessons.id::text = instructor_evaluation_drafts.lesson_id::text
      AND lessons.instructor_id::text = auth.uid()::text
  )
);

CREATE POLICY "Instructors can delete their evaluation drafts"
ON public.instructor_evaluation_drafts
FOR DELETE
TO authenticated
USING (
  auth.uid() = instructor_id
  AND EXISTS (
    SELECT 1
    FROM public.lessons
    WHERE lessons.id::text = instructor_evaluation_drafts.lesson_id::text
      AND lessons.instructor_id::text = auth.uid()::text
  )
);

INSERT INTO public.instructor_evaluation_drafts (
  submission_id,
  lesson_id,
  student_id,
  instructor_id,
  evaluation,
  updated_at
)
SELECT
  submission.id,
  lesson.id::text::uuid,
  feedback.student_id::text::uuid,
  COALESCE(feedback.instructor_id::text, lesson.instructor_id::text)::uuid,
  jsonb_build_object(
    'scores', feedback.rubric_scores,
    'totalScore', feedback.total_score,
    'comments', COALESCE(feedback.criterion_feedback->>'overallComments', feedback.comments, ''),
    'criterionFeedback', COALESCE(feedback.criterion_feedback->'comments', '{}'::jsonb),
    'stageFeedback', COALESCE(feedback.criterion_feedback->'stages', '{}'::jsonb),
    'stageScores', COALESCE(feedback.criterion_feedback->'stageScores', '{}'::jsonb),
    'reportCardScoreOverrides', COALESCE(feedback.criterion_feedback->'reportCardScoreOverrides', '{}'::jsonb),
    'taskFeedback', COALESCE(feedback.criterion_feedback->'taskFeedback', '{}'::jsonb),
    'inlineCorrections', COALESCE(feedback.criterion_feedback->'inlineCorrections', '{}'::jsonb),
    'stageVoiceFeedback', COALESCE(feedback.criterion_feedback->'stageVoiceFeedback', '{}'::jsonb),
    'strengths', feedback.strengths,
    'areasToImprove', feedback.areas_to_improve,
    'studyHubPrescription', feedback.study_hub_prescription,
    'voiceFeedbackUrl', feedback.voice_feedback_url,
    'published', false
  ),
  feedback.updated_at
FROM public.instructor_feedback AS feedback
JOIN public.lessons AS lesson
  ON lesson.id::text = feedback.lesson_id::text
JOIN LATERAL (
  SELECT submissions.id
  FROM public.submissions
  WHERE submissions.lesson_id::text = feedback.lesson_id::text
    AND submissions.student_id::text = feedback.student_id::text
  ORDER BY submissions.submitted_at DESC
  LIMIT 1
) AS submission ON true
WHERE feedback.is_published = false
  AND COALESCE(feedback.instructor_id, lesson.instructor_id) IS NOT NULL
ON CONFLICT (submission_id) DO NOTHING;

DELETE FROM public.instructor_feedback
WHERE is_published = false
  AND EXISTS (
    SELECT 1
    FROM public.instructor_evaluation_drafts AS draft
    WHERE draft.lesson_id::text = instructor_feedback.lesson_id::text
      AND draft.student_id::text = instructor_feedback.student_id::text
      AND draft.instructor_id::text = instructor_feedback.instructor_id::text
  );

NOTIFY pgrst, 'reload schema';
