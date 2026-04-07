"use client";

import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { CheckCircle2 } from "lucide-react";

type DocumentType = "mark_scheme" | "exemplar" | "question_paper";

export type ProcessingStep = {
  label: string;
  detail: string;
  progress: number;
};

export const STATUS_STEPS: Record<string, ProcessingStep> = {
  pending: {
    label: "Queued",
    detail: "Waiting to start…",
    progress: 10,
  },
  processing: {
    label: "Reading PDF",
    detail:
      "DeepMark is extracting questions and mark scheme criteria from the document…",
    progress: 40,
  },
  extracting: {
    label: "Extracting data",
    detail: "Structuring questions, mark points, and metadata…",
    progress: 70,
  },
  extracted: {
    label: "Finalising",
    detail: "Saving questions and running quality checks…",
    progress: 90,
  },
  ocr_complete: {
    label: "Complete",
    detail: "All done! Redirecting…",
    progress: 100,
  },
};

export function ProcessingStatus({
  status,
  documentType,
}: {
  status: string | null;
  documentType: DocumentType;
}) {
  const step = status
    ? STATUS_STEPS[status] ?? STATUS_STEPS.pending
    : STATUS_STEPS.pending;
  const docLabel =
    documentType === "mark_scheme"
      ? "mark scheme"
      : documentType === "question_paper"
      ? "question paper"
      : "exemplar";

  return (
    <div className="space-y-4 py-2">
      <div className="flex items-center gap-3">
        {step.progress === 100 ? (
          <CheckCircle2 className="h-5 w-5 shrink-0 text-green-500" />
        ) : (
          <Spinner className="h-5 w-5 shrink-0" />
        )}
        <div className="flex-1">
          <p className="text-sm font-medium">{step.label}</p>
          <p className="text-xs text-muted-foreground">{step.detail}</p>
        </div>
      </div>
      <Progress value={step.progress} className="h-2" />
      <div className="space-y-1">
        {Object.entries(STATUS_STEPS).map(([key, s]) => {
          const currentProgress = step.progress;
          const isComplete = s.progress < currentProgress;
          const isActive = s.progress === currentProgress;
          const isPending = s.progress > currentProgress;
          if (key === "ocr_complete") return null;
          return (
            <div key={key} className="flex items-center gap-2 text-xs">
              <span
                className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                  isComplete
                    ? "bg-green-500"
                    : isActive
                    ? "bg-primary"
                    : isPending
                    ? "bg-muted-foreground/30"
                    : "bg-muted-foreground/30"
                }`}
              />
              <span
                className={
                  isComplete
                    ? "text-muted-foreground line-through"
                    : isActive
                    ? "font-medium"
                    : "text-muted-foreground/60"
                }
              >
                {s.label}
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Processing your {docLabel} PDF. This usually takes 30–90 seconds.
      </p>
    </div>
  );
}
