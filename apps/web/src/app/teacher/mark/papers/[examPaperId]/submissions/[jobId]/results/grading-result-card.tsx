"use client";

import { McqOptions } from "@/components/mcq-options";
import { Progress } from "@/components/ui/progress";
import type {
  CommentPayload,
  GradingResult,
  StudentPaperAnnotation,
} from "@/lib/marking/types";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { AnswerEditor } from "./answer-editor";

function scoreColor(awarded: number, max: number): string {
  if (max === 0) return "bg-zinc-400";
  const pct = awarded / max;
  if (pct >= 0.7) return "bg-green-500";
  if (pct >= 0.4) return "bg-amber-500";
  return "bg-red-500";
}

export function GradingResultCard({
  jobId,
  result,
  currentAnswer,
  isActive = false,
  onAnswerSaved,
  annotations = [],
}: {
  jobId: string;
  result: GradingResult;
  currentAnswer: string;
  isActive?: boolean;
  onAnswerSaved: (questionId: string, text: string) => void;
  annotations?: StudentPaperAnnotation[];
}) {
  const r = result;
  const qPercent =
    r.max_score > 0 ? Math.round((r.awarded_score / r.max_score) * 100) : 0;
  const color = scoreColor(r.awarded_score, r.max_score);

  return (
    <div
      id={`question-${r.question_number}`}
      className={cn(
        "px-5 py-4 space-y-3 transition-all duration-300",
        isActive && "bg-blue-500/20"
      )}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5 flex-1 min-w-0">
          <p className="font-mono text-xs font-bold tracking-widest uppercase text-zinc-400 dark:text-zinc-500">
            Q {r.question_number}
          </p>
          {r.question_text && (
            <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 leading-snug">
              {r.question_text}
            </p>
          )}
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold text-white tabular-nums",
            color
          )}
        >
          {r.awarded_score}/{r.max_score}
        </span>
      </div>

      {/* Student answer — MCQ or written */}
      {r.marking_method === "deterministic" &&
      r.multiple_choice_options &&
      r.correct_option_labels ? (
        <div>
          <McqOptions
            options={r.multiple_choice_options}
            correctLabels={r.correct_option_labels}
            studentAnswer={r.student_answer}
          />
        </div>
      ) : (
        <div>
          <AnswerEditor
            jobId={jobId}
            questionNumber={r.question_number}
            initialText={currentAnswer}
            onSaved={(newText) => onAnswerSaved(r.question_id, newText)}
          />
        </div>
      )}

      {/* Margin comments from annotations */}
      {annotations.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {annotations
            .filter((a) => a.overlay_type === "comment")
            .map((a) => {
              const text = (a.payload as CommentPayload).text;
              const borderColor =
                a.sentiment === "positive"
                  ? "border-green-400 text-green-700 dark:text-green-400"
                  : a.sentiment === "negative"
                  ? "border-red-400 text-red-700 dark:text-red-400"
                  : "border-zinc-300 text-zinc-600 dark:text-zinc-400";
              return (
                <span
                  key={a.id}
                  className={cn(
                    "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium leading-tight",
                    borderColor
                  )}
                >
                  {text}
                </span>
              );
            })}
        </div>
      )}

      {/* WWW / EBI — always visible (not inside collapsible), hidden for MCQ */}
      {r.marking_method !== "deterministic" &&
        (r.what_went_well?.length ?? 0) + (r.even_better_if?.length ?? 0) >
          0 && (
          <div className="space-y-2 text-xs">
            {r.what_went_well && r.what_went_well.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-green-600 dark:text-green-400 mb-0.5">
                  What went well
                </p>
                <ul className="space-y-0.5">
                  {r.what_went_well.map((item, i) => (
                    <li
                      key={i}
                      className="text-muted-foreground flex items-start gap-1"
                    >
                      <span className="text-green-500 shrink-0">✓</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {r.even_better_if && r.even_better_if.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400 mb-0.5">
                  Even better if
                </p>
                <ul className="space-y-0.5">
                  {r.even_better_if.map((item, i) => (
                    <li
                      key={i}
                      className="text-muted-foreground flex items-start gap-1"
                    >
                      <span className="text-amber-500 shrink-0">→</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

      {/* Collapsible feedback + examiner reasoning — hidden for MCQ */}
      {r.marking_method !== "deterministic" &&
        (r.feedback_summary || r.llm_reasoning) && (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground list-none flex items-center gap-1 w-fit">
              Feedback <ChevronDown className="h-3 w-3" />
            </summary>
            <div className="mt-2 space-y-3">
              {r.feedback_summary && (
                <p className="text-muted-foreground leading-relaxed bg-zinc-50 dark:bg-zinc-900 rounded-md px-3 py-2">
                  {r.feedback_summary}
                </p>
              )}
              {r.llm_reasoning && r.llm_reasoning !== r.feedback_summary && (
                <p className="text-muted-foreground whitespace-pre-wrap leading-relaxed pl-2 border-l">
                  {r.llm_reasoning}
                </p>
              )}
            </div>
          </details>
        )}

      {/* Score progress + extras */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Progress value={qPercent} className="h-1.5 flex-1" />
          <span className="text-xs text-muted-foreground tabular-nums w-8 text-right">
            {qPercent}%
          </span>
        </div>
        {r.marking_method === "level_of_response" &&
          r.level_awarded !== undefined && (
            <p className="text-xs text-muted-foreground">
              Level awarded:{" "}
              <span className="font-medium">{r.level_awarded}</span>
            </p>
          )}
      </div>
    </div>
  );
}
