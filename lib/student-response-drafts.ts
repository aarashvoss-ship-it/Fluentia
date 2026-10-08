export interface StudentResponseDraft {
  value: string;
  updatedAt: string;
}

function getDraftKey(lessonId: string, blockId: string, studentId: string) {
  return `student_response_${lessonId}_${blockId}_${studentId}`;
}

export function readStudentResponseDraft(
  lessonId: string,
  blockId: string,
  studentId: string,
): StudentResponseDraft | null {
  try {
    const stored = window.localStorage.getItem(getDraftKey(lessonId, blockId, studentId));
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object") return null;
    const draft = parsed as Partial<StudentResponseDraft>;
    return typeof draft.value === "string" && typeof draft.updatedAt === "string"
      ? { value: draft.value, updatedAt: draft.updatedAt }
      : null;
  } catch (error) {
    console.error("[Student Response] Unable to read local draft:", { lessonId, blockId, studentId, error });
    return null;
  }
}

export function writeStudentResponseDraft(
  lessonId: string,
  blockId: string,
  studentId: string,
  value: string,
): boolean {
  try {
    window.localStorage.setItem(
      getDraftKey(lessonId, blockId, studentId),
      JSON.stringify({ value, updatedAt: new Date().toISOString() } satisfies StudentResponseDraft),
    );
    return true;
  } catch (error) {
    console.error("[Student Response] Unable to save local draft:", { lessonId, blockId, studentId, error });
    return false;
  }
}

export function removeStudentResponseDraft(lessonId: string, blockId: string, studentId: string): void {
  try {
    window.localStorage.removeItem(getDraftKey(lessonId, blockId, studentId));
  } catch (error) {
    console.error("[Student Response] Unable to remove local draft:", { lessonId, blockId, studentId, error });
  }
}
