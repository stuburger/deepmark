"use client";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  type UpdateQuestionInput,
  updateQuestion,
} from "@/lib/dashboard-actions";
import { CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Props = {
  questionId: string;
  initialText: string;
  initialPoints: number | null;
  initialQuestionNumber: string | null;
  onSaved?: () => void;
};

export function QuestionEditForm({
  questionId,
  initialText,
  initialPoints,
  initialQuestionNumber,
  onSaved,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [text, setText] = useState(initialText);
  const [points, setPoints] = useState(
    initialPoints !== null ? String(initialPoints) : ""
  );
  const [questionNumber, setQuestionNumber] = useState(
    initialQuestionNumber ?? ""
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [embeddingUpdated, setEmbeddingUpdated] = useState(false);

  const isDirty =
    text !== initialText ||
    points !== (initialPoints !== null ? String(initialPoints) : "") ||
    questionNumber !== (initialQuestionNumber ?? "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    const trimmed = text.trim();
    if (!trimmed) {
      setError("Question text cannot be empty");
      return;
    }

    const parsedPoints = points !== "" ? Number.parseInt(points, 10) : null;
    if (
      points !== "" &&
      (isNaN(parsedPoints as number) || (parsedPoints as number) < 0)
    ) {
      setError("Marks must be a positive number");
      return;
    }

    const input: UpdateQuestionInput = {};
    if (trimmed !== initialText) input.text = trimmed;
    if (parsedPoints !== initialPoints) input.points = parsedPoints;
    const trimmedNumber = questionNumber.trim() || null;
    if (trimmedNumber !== initialQuestionNumber)
      input.question_number = trimmedNumber;

    startTransition(async () => {
      const result = await updateQuestion(questionId, input);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
      setEmbeddingUpdated(result.embeddingUpdated);
      router.refresh();
      onSaved?.();
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <FieldGroup>
        <Field>
          <Textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setSaved(false);
            }}
            rows={4}
            disabled={isPending}
            className="resize-y font-mono text-sm"
          />
          <FieldError>
            {error && error.includes("text") ? error : null}
          </FieldError>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field>
            <FieldLabel>Question number</FieldLabel>
            <Input
              value={questionNumber}
              onChange={(e) => {
                setQuestionNumber(e.target.value);
                setSaved(false);
              }}
              disabled={isPending}
              placeholder="e.g. 1a"
              className="max-w-32 font-mono"
            />
          </Field>

          <Field>
            <FieldLabel>Marks</FieldLabel>
            <Input
              type="number"
              min={0}
              value={points}
              onChange={(e) => {
                setPoints(e.target.value);
                setSaved(false);
              }}
              disabled={isPending}
              placeholder="e.g. 6"
              className="max-w-32"
            />
            <FieldError>
              {error && error.includes("arks") ? error : null}
            </FieldError>
          </Field>
        </div>
      </FieldGroup>

      {error && !error.includes("text") && !error.includes("arks") && (
        <p className="mt-3 text-sm text-destructive">{error}</p>
      )}

      <div className="mt-4 flex items-center gap-3">
        <Button type="submit" size="sm" disabled={isPending || !isDirty}>
          {isPending ? (
            <>
              <Spinner className="h-3.5 w-3.5 mr-1.5" />
              Saving…
            </>
          ) : (
            "Save changes"
          )}
        </Button>

        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
            <CheckCircle2 className="h-4 w-4" />
            Saved
            {embeddingUpdated && (
              <span className="text-muted-foreground">
                {" "}
                · embedding updated
              </span>
            )}
          </span>
        )}
      </div>
    </form>
  );
}
