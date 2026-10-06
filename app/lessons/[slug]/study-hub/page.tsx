"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { LearningSidebar } from "@/components/study-room/learning-sidebar";
import { getLessonById, type LessonWithVersion } from "@/lib/lessons";
import { supabase } from "@/lib/supabaseClient";
import { fetchSavedVocabulary, fetchStudentNotes, removeVocabularyWord, saveStudentNote } from "@/services/storage-service";
import type { SavedVocabularyWord, StudentNote } from "@/types/lesson";

export default function StudyHubPage() {
  const params = useParams<{ slug: string }>();
  const lessonSlug = params?.slug;
  const [lesson, setLesson] = useState<LessonWithVersion | null>(null);
  const [studentId, setStudentId] = useState<string | undefined>();
  const [studentToken, setStudentToken] = useState<string | undefined>();
  const [words, setWords] = useState<SavedVocabularyWord[]>([]);
  const [notes, setNotes] = useState<StudentNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadStudyHub() {
      try {
        if (!lessonSlug) throw new Error("A lesson identifier is required.");
        const [loadedLesson, authResult] = await Promise.all([
          getLessonById(lessonSlug),
          supabase.auth.getUser(),
        ]);
        if (cancelled) return;
        if (!loadedLesson) throw new Error("The requested lesson could not be found.");
        if (authResult.error && authResult.error.name !== "AuthSessionMissingError" && !/Auth session missing/i.test(authResult.error.message || "")) {
          throw authResult.error;
        }

        let resolvedStudentId = loadedLesson.student_id || undefined;
        let resolvedStudentToken = loadedLesson.student_token || loadedLesson.student_id || undefined;
        if (authResult.data.user) {
          resolvedStudentId = authResult.data.user.id;
          resolvedStudentToken = authResult.data.user.id;
          const { data: student, error: studentError } = await supabase
            .from("students")
            .select("token")
            .eq("id", authResult.data.user.id)
            .maybeSingle();
          if (studentError) console.warn("Unable to load the authenticated student's token:", studentError.message);
          if (student?.token) resolvedStudentToken = student.token;
        }

        const [loadedWords, loadedNotes] = await Promise.all([
          fetchSavedVocabulary(resolvedStudentToken),
          fetchStudentNotes(resolvedStudentToken),
        ]);
        if (cancelled) return;
        setLesson(loadedLesson);
        setStudentId(resolvedStudentId);
        setStudentToken(resolvedStudentToken);
        setWords(loadedWords);
        setNotes(loadedNotes);
      } catch (loadError) {
        if (cancelled) return;
        console.error("Unable to load the standalone Study Hub:", loadError);
        setError("The Study Hub could not be loaded. Please return to the lesson and try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadStudyHub();
    return () => {
      cancelled = true;
    };
  }, [lessonSlug]);

  const handleSaveNote = (note: StudentNote) => {
    setNotes((current) => [note, ...current.filter((item) => item.id !== note.id)]);
    void saveStudentNote(studentToken, note).then(setNotes).catch((saveError) => {
      console.error("Unable to save Study Hub note:", saveError);
      setError("Your note could not be saved. Please try again.");
    });
  };

  const handleRemoveWord = (word: string) => {
    setWords((current) => current.filter((item) => item.word.toLowerCase() !== word.toLowerCase()));
    void removeVocabularyWord(studentToken, word).then(setWords).catch((removeError) => {
      console.error("Unable to remove Study Hub vocabulary:", removeError);
      setError("The vocabulary word could not be removed. Please try again.");
    });
  };

  if (loading) {
    return <main className="flex min-h-dvh items-center justify-center bg-background text-sm text-stone-400">Loading Study Hub...</main>;
  }

  if (error && !lesson) {
    return <main className="flex min-h-dvh items-center justify-center bg-background px-6 text-center text-sm text-red-300" role="alert">{error}</main>;
  }

  if (!lesson) return null;

  return (
    <main className="h-dvh overflow-hidden bg-background">
      {error && <p className="absolute left-4 top-4 z-10 rounded-md border border-red-500/30 bg-surface px-3 py-2 text-xs text-red-300" role="alert">{error}</p>}
      <LearningSidebar
        open
        standalone
        onClose={() => window.location.assign(`/lessons/${encodeURIComponent(lessonSlug)}`)}
        words={words}
        notes={notes}
        studentId={studentId}
        studentToken={studentToken}
        activeLessonId={lesson.id}
        resource={lesson.instructor_note || undefined}
        onSaveNote={handleSaveNote}
        onRemoveWord={handleRemoveWord}
      />
    </main>
  );
}
