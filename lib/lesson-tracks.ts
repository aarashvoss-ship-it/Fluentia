export interface LessonTrack {
  id: string;
  instructor_id: string;
  name: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

async function trackRequest<T>(init?: RequestInit): Promise<T> {
  const response = await fetch("/api/lesson-tracks", {
    credentials: "same-origin",
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const result = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(result.error || `Lesson track request failed (${response.status}).`);
  return result;
}

function emitLessonUpdated() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("fluentia:lesson-updated"));
}

export async function getLessonTracks(): Promise<LessonTrack[]> {
  const result = await trackRequest<{ tracks: LessonTrack[] }>();
  return result.tracks;
}

export async function createLessonTrack(name: string): Promise<LessonTrack> {
  const result = await trackRequest<{ track: LessonTrack }>({
    method: "POST",
    body: JSON.stringify({ name }),
  });
  emitLessonUpdated();
  return result.track;
}

export async function updateLessonTrack(
  id: string,
  changes: { name?: string; is_archived?: boolean },
): Promise<LessonTrack> {
  const result = await trackRequest<{ track: LessonTrack }>({
    method: "PATCH",
    body: JSON.stringify({ id, ...changes }),
  });
  emitLessonUpdated();
  return result.track;
}
