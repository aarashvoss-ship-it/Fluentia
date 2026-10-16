import type { Pool } from "pg";

export const SAMPLE_LESSON_ID = "b1b10001-1001-4001-8001-000000000001";

export async function assignUnownedSampleLesson(pool: Pool, instructorId: string): Promise<void> {
  await pool.query(
    `UPDATE public.lessons
     SET instructor_id = $1::uuid, assigned_all_students = true, updated_at = now()
     WHERE id = $2::uuid
       AND instructor_id IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.lessons
         WHERE instructor_id = $1::uuid
           AND (status = 'published' OR is_published = true)
       )`,
    [instructorId, SAMPLE_LESSON_ID],
  );
}
