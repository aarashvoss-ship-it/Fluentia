"use client";

import { useState } from "react";
import type { ExerciseQuestionType, QuizQuestion } from "@/types/lesson";
import { FillInBlanksMarkdown } from "@/components/study-room/fill-in-blanks-markdown";
import { MarkdownContent } from "@/components/study-room/markdown-content";

const TRUE_FALSE_NOT_GIVEN_OPTIONS = ["True", "False", "Not Given"];

export function getExerciseQuestionType(question: QuizQuestion): ExerciseQuestionType {
  return question.type || "multiple_choice";
}

export function ExerciseQuestions({
  questions,
  choiceAnswers = {},
  textAnswers = {},
  onChoiceAnswer,
  onTextAnswer,
  onBlankAnswer,
  readOnly = false,
}: {
  questions: QuizQuestion[];
  choiceAnswers?: Record<string, string>;
  textAnswers?: Record<string, string>;
  onChoiceAnswer?: (questionId: string, answer: string) => void;
  onTextAnswer?: (questionId: string, answer: string) => void;
  onBlankAnswer?: (questionId: string, blankIndex: number, answer: string) => void;
  readOnly?: boolean;
}) {
  const [revealedSamples, setRevealedSamples] = useState<Record<string, boolean>>({});

  return (
    <div className="space-y-6">
      {questions.map((question, index) => {
        const type = getExerciseQuestionType(question);
        const options = type === "true_false_not_given"
          ? TRUE_FALSE_NOT_GIVEN_OPTIONS
          : question.options || [];
        const correctAnswer = question.correct_answer
          || question.correctAnswer
          || (type === "short_answer" ? question.sample_answer : "");

        return (
          <section key={question.id} className="space-y-3 border-b border-[#202631] pb-5 last:border-0 last:pb-0">
            <div id={`exercise-question-${question.id}`} role="heading" aria-level={4} className="flex items-start gap-1 text-base font-semibold leading-relaxed text-stone-100">
              <span className="mr-1 text-amber-400">{index + 1}.</span>
              {type === "fill_in_the_blanks" ? (
                <FillInBlanksMarkdown
                  blockId={question.id}
                  text={question.prompt || ""}
                  acceptableAnswers={question.acceptableAnswers || []}
                  wordBank={question.wordBank}
                  caseSensitive={question.caseSensitive}
                  values={textAnswers}
                  onChange={(blankIndex, answer) => onBlankAnswer?.(question.id, blankIndex, answer)}
                  readOnly={readOnly}
                  className="min-w-0 flex-1 text-sm font-normal leading-relaxed text-stone-300 [&_p]:mb-0"
                />
              ) : (
                <MarkdownContent value={question.prompt || ""} className="min-w-0 flex-1 text-base font-semibold leading-relaxed text-stone-100 [&_p]:m-0 [&_strong]:font-semibold" />
              )}
            </div>

            {type === "short_answer" ? (
              <textarea
                value={textAnswers[question.id] || ""}
                onChange={(event) => onTextAnswer?.(question.id, event.target.value)}
                readOnly={readOnly}
                rows={5}
                placeholder={readOnly ? "Short answer response" : "Write your answer here..."}
                aria-label={`Question ${index + 1} response`}
                className="min-h-[120px] w-full resize-y rounded-lg border border-[#202631] bg-[#0c1017] p-3 text-sm text-stone-200 outline-none focus:border-amber-500/40 read-only:cursor-default read-only:text-stone-400"
              />
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {options.filter(Boolean).map((option, optionIndex) => {
                  const isSelected = choiceAnswers[question.id] === option;
                  return (
                    <button
                      key={`${question.id}-${optionIndex}`}
                      type="button"
                      disabled={readOnly}
                      onClick={() => onChoiceAnswer?.(question.id, option)}
                      aria-pressed={!readOnly && isSelected}
                      className={`rounded-md border px-3 py-2 text-left text-sm transition disabled:cursor-default ${isSelected ? "border-amber-500/40 bg-amber-500/20 text-amber-400" : "border-[#202631] bg-[#0c1017] text-stone-300 hover:border-amber-500/40 hover:text-amber-400 disabled:hover:border-[#202631] disabled:hover:text-stone-300"}`}
                    >
                      {question.optionIndexingStyle === "alphabetical"
                        ? `${String.fromCharCode(65 + optionIndex)}. ${option}`
                        : question.optionIndexingStyle === "numeric" ? `${optionIndex + 1}. ${option}` : option}
                    </button>
                  );
                })}
              </div>
            )}

            {!readOnly && type === "short_answer" && question.sample_answer?.trim() && (
              <>
                <button
                  type="button"
                  onClick={() => setRevealedSamples((current) => ({ ...current, [question.id]: !current[question.id] }))}
                  className="text-xs text-amber-400 hover:text-amber-300"
                >
                  {revealedSamples[question.id] ? "Hide sample answer" : "Show sample answer"}
                </button>
                {revealedSamples[question.id] && <MarkdownContent value={question.sample_answer} className="rounded border border-amber-500/40 bg-amber-500/20 p-3 text-sm text-stone-300" />}
              </>
            )}
            {readOnly && correctAnswer && <p className="text-xs text-stone-500">Answer key: <span className="text-amber-400">{correctAnswer}</span></p>}
          </section>
        );
      })}
    </div>
  );
}
