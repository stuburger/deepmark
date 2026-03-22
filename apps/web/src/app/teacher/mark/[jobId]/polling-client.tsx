"use client";

import { ExamPaperPanel } from "@/components/ExamPaperPanel";
import { Button } from "@/components/ui/button";
import {
  type StudentPaperJobPayload,
  getStudentPaperJob,
  retriggerOcr,
} from "@/lib/mark-actions";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const POLLING_STATES = new Set(["pending", "processing", "grading"]);

const STATUS_LABELS: Record<string, string> = {
  pending: "Queued — waiting to start",
  processing: "Reading pages…",
  extracting: "Extracting text from scan…",
  extracted: "Text extracted",
  grading: "Marking answers against the mark scheme…",
};

export function MarkingJobPoller({
  jobId,
  initialStatus,
}: {
  jobId: string;
  initialStatus: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);

  useEffect(() => {
    if (!POLLING_STATES.has(status)) return;

    const interval = setInterval(async () => {
      const result = await getStudentPaperJob(jobId);
      if (!result.ok) return;
      const newStatus = result.data.status;
      if (newStatus !== status) {
        setStatus(newStatus);
        router.refresh();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [status, jobId, router]);

  const label = STATUS_LABELS[status] ?? `Processing (${status})`;

  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3">
      <Loader2 className="h-5 w-5 text-primary animate-spin shrink-0" />
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Checking for updates every 5 seconds…
        </p>
      </div>
    </div>
  );
}

/**
 * Shown when the page loads while grading is already in progress.
 * Polls every 2s for partial grading_results and renders them live.
 * Calls router.refresh() when the job reaches a terminal state.
 */
export function LiveGradingPoller({
  jobId,
  initialData,
}: {
  jobId: string;
  initialData: StudentPaperJobPayload;
}) {
  const router = useRouter();
  const [data, setData] = useState(initialData);

  useEffect(() => {
    const terminal = new Set(["ocr_complete", "failed", "cancelled"]);
    if (terminal.has(data.status)) return;

    const interval = setInterval(async () => {
      const result = await getStudentPaperJob(jobId);
      if (!result.ok) return;
      const next = result.data;
      // Use functional update to compare against latest state without a ref
      setData((prev) => {
        if (
          next.grading_results.length !== prev.grading_results.length ||
          next.status !== prev.status
        ) {
          return next;
        }
        return prev;
      });
      if (terminal.has(next.status)) {
        clearInterval(interval);
        router.refresh();
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [jobId, router, data.status]);

  const isGrading = !["ocr_complete", "failed", "cancelled"].includes(
    data.status
  );

  return (
    <ExamPaperPanel
      gradingResults={data.grading_results}
      extractedAnswers={data.extracted_answers ?? undefined}
      isGrading={isGrading}
      examPaperTitle={data.exam_paper_title}
    />
  );
}

export function ReScanButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRescan() {
    setLoading(true);
    setError(null);
    const result = await retriggerOcr(jobId);
    if (!result.ok) {
      setError(result.error);
      setLoading(false);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        variant="outline"
        size="sm"
        disabled={loading}
        onClick={handleRescan}
      >
        {loading && <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />}
        Re-scan pages
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
