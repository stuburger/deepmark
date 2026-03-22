import { buttonVariants } from "@/components/ui/button-variants";
import {
  type StudentPaperJobPayload,
  getJobScanPageUrls,
  getStudentPaperResult,
} from "@/lib/mark-actions";
import type { JobEvent } from "@mcp-gcse/db";
import {
  AlertCircle,
  CheckCircle2,
  Circle,
  Loader2,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ContinueMarkingClient } from "./continue-marking-client";
import { MarkScanTwoColumn } from "./mark-scan-two-column";
import {
  LiveGradingPoller,
  MarkingJobPoller,
  ReScanButton,
} from "./polling-client";
import { MarkingResultsClient } from "./results-client";
import { TextExtractedFlowClient } from "./text-extracted-flow-client";

// ─── Job timeline ─────────────────────────────────────────────────────────────

type NodeState = "complete" | "active" | "pending";

function TimelineIcon({ state }: { state: NodeState }) {
  if (state === "complete")
    return <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />;
  if (state === "active")
    return (
      <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0 mt-0.5" />
    );
  return (
    <Circle className="h-4 w-4 text-muted-foreground/30 shrink-0 mt-0.5" />
  );
}

function TimelineRow({
  state,
  label,
  detail,
  children,
}: {
  state: NodeState;
  label: string;
  detail?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <TimelineIcon state={state} />
      <div className="flex-1 min-w-0">
        <span
          className={`text-sm leading-tight ${
            state === "complete"
              ? "text-foreground"
              : state === "active"
              ? "text-foreground font-medium"
              : "text-muted-foreground"
          }`}
        >
          {label}
        </span>
        {detail && (
          <p className="text-xs text-muted-foreground mt-0.5">{detail}</p>
        )}
        {children}
      </div>
    </div>
  );
}

/** Event-driven timeline. Falls back to status-derived display for old jobs. */
function JobTimeline({ data }: { data: StudentPaperJobPayload }) {
  const events = data.job_events;

  // ── Fallback for jobs that pre-date the event log ──────────────────────────
  if (!events) {
    return (
      <div className="rounded-xl border bg-card px-4 py-3 space-y-3">
        This an older job, and the timeline is not available.
      </div>
    );
  }

  // ── Event-driven display ───────────────────────────────────────────────────
  const find = <T extends JobEvent["type"]>(type: T) =>
    events.find((e): e is Extract<JobEvent, { type: T }> => e.type === type);
  const count = <T extends JobEvent["type"]>(type: T) =>
    events.filter((e) => e.type === type).length;

  const ocrStarted = find("ocr_started");
  const answersExtracted = find("answers_extracted");
  const ocrComplete = find("ocr_complete");
  const studentLinked = find("student_linked");
  const examPaperSelected = find("exam_paper_selected");
  const gradingStarted = find("grading_started");
  const regionStarted = find("region_attribution_started");
  const regionComplete = find("region_attribution_complete");
  const gradingComplete = find("grading_complete");
  const jobFailed = find("job_failed");
  const questionsGradedCount = count("question_graded");

  const ocrState: NodeState = ocrComplete
    ? "complete"
    : ocrStarted
    ? "active"
    : "pending";

  const gradingState: NodeState = gradingComplete
    ? "complete"
    : gradingStarted
    ? "active"
    : "pending";

  const regionState: NodeState = regionComplete
    ? "complete"
    : regionStarted
    ? "active"
    : "pending";

  const ocrDetail = ocrComplete
    ? answersExtracted
      ? `${answersExtracted.count} answers extracted${
          answersExtracted.student_name
            ? ` · ${answersExtracted.student_name}`
            : ""
        }`
      : "Complete"
    : ocrStarted
    ? "Reading pages with Gemini…"
    : undefined;

  const gradingDetail = gradingComplete
    ? `${gradingComplete.total_awarded} / ${gradingComplete.total_max} marks`
    : gradingStarted
    ? `${questionsGradedCount} / ${gradingStarted.questions_total} questions marked`
    : undefined;

  return (
    <div className="rounded-xl border bg-card px-4 py-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Progress
        </p>
        <span className="font-mono text-xs text-muted-foreground/60 bg-muted px-1.5 py-0.5 rounded">
          {data.status}
        </span>
      </div>

      <div className="space-y-2.5">
        <TimelineRow
          state="complete"
          label="Scan uploaded"
          detail={`${data.pages_count} page${
            data.pages_count !== 1 ? "s" : ""
          }`}
        />

        <TimelineRow state={ocrState} label="Read pages" detail={ocrDetail} />

        {studentLinked && (
          <TimelineRow
            state="complete"
            label="Student linked"
            detail={studentLinked.student_name}
          />
        )}

        {examPaperSelected && (
          <TimelineRow
            state="complete"
            label="Exam paper selected"
            detail={examPaperSelected.title}
          />
        )}

        {gradingStarted && (
          <TimelineRow
            state={gradingState}
            label="Mark answers"
            detail={gradingDetail}
          >
            {regionStarted && (
              <div className="mt-1.5 ml-0.5 flex gap-2.5 items-start">
                <div className="mt-0.5 w-px h-3 bg-border shrink-0" />
                <TimelineRow
                  state={regionState}
                  label="Locate answers on scan"
                  detail={
                    regionComplete
                      ? `${regionComplete.questions_located} questions located`
                      : "Running in parallel…"
                  }
                />
              </div>
            )}
          </TimelineRow>
        )}

        {jobFailed && (
          <TimelineRow
            state="complete"
            label={`Failed during ${jobFailed.phase}`}
            detail={jobFailed.error}
          />
        )}
      </div>
    </div>
  );
}

// ─── Heading derivation ───────────────────────────────────────────────────────

function deriveHeading(data: StudentPaperJobPayload): {
  title: string;
  subtitle: string | null;
} {
  if (data.status === "text_extracted") {
    if (!data.student_id) {
      return {
        title: "Review scan",
        subtitle: "Link this paper to a student to continue.",
      };
    }
    if (data.exam_paper_id) {
      return { title: "Processing", subtitle: "Your paper is being marked." };
    }
    return {
      title: "Select exam paper",
      subtitle: "Pick the exam paper to mark this work against.",
    };
  }

  if (data.status === "failed") {
    return {
      title: data.student_name ?? "Processing failed",
      subtitle: data.exam_paper_title,
    };
  }

  if (data.status === "cancelled") {
    return { title: "Cancelled", subtitle: null };
  }

  return {
    title: data.student_name ?? "Unknown student",
    subtitle: data.exam_paper_title,
  };
}

// ─── Failed CTA ───────────────────────────────────────────────────────────────

function FailedStatusCTA({
  data,
  jobId,
}: {
  data: StudentPaperJobPayload;
  jobId: string;
}) {
  const hasRecoverableAnswers =
    data.extracted_answers &&
    data.extracted_answers.length > 0 &&
    !data.exam_paper_id;

  if (hasRecoverableAnswers) {
    return (
      <div className="space-y-4">
        {/* Recovery banner */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-950/20 px-5 py-4 flex items-start gap-3">
          <div className="rounded-full bg-emerald-100 dark:bg-emerald-900/40 p-2 shrink-0 mt-0.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <p className="font-semibold text-sm">
              {data.extracted_answers!.length} answers were recovered
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Processing failed partway through, but the student&apos;s work was
              saved. Select an exam paper to finish marking.
            </p>
          </div>
        </div>

        {/* Paper selection — the primary action */}
        <ContinueMarkingClient
          jobId={jobId}
          extractedAnswers={data.extracted_answers!}
          studentName={data.student_name}
          detectedSubject={data.detected_subject}
        />

        {/* Error detail — secondary */}
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-xs text-destructive/80">
            {data.error ?? "An unknown error occurred during processing."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-5 py-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-destructive/10 p-2 shrink-0">
          <AlertCircle className="h-5 w-5 text-destructive" />
        </div>
        <div>
          <p className="font-semibold text-destructive">Processing failed</p>
          <p className="text-sm text-destructive/80 mt-1">
            {data.error ?? "An unknown error occurred."}
          </p>
        </div>
      </div>
      <Link
        href="/teacher/mark/new"
        className={buttonVariants({ className: "w-full justify-center" })}
      >
        Start over — mark a new paper
      </Link>
    </div>
  );
}

// ─── Cancelled CTA ────────────────────────────────────────────────────────────

function CancelledStatusCTA() {
  return (
    <div className="rounded-xl border bg-muted/40 px-6 py-8 flex flex-col items-center text-center gap-4">
      <div className="rounded-full bg-muted p-3">
        <XCircle className="h-6 w-6 text-muted-foreground" />
      </div>
      <div>
        <p className="font-semibold">This job was cancelled</p>
        <p className="text-sm text-muted-foreground mt-1">
          No results were saved.
        </p>
      </div>
      <Link href="/teacher/mark/new" className={buttonVariants()}>
        Mark a new paper
      </Link>
    </div>
  );
}

// ─── Status call-to-action ────────────────────────────────────────────────────

function StatusCallToAction({
  data,
  jobId,
}: {
  data: StudentPaperJobPayload;
  jobId: string;
}) {
  const isGradingInProgress =
    data.status === "processing" && data.exam_paper_id !== null;

  if (data.status === "text_extracted") {
    return (
      <TextExtractedFlowClient
        jobId={jobId}
        studentLinked={Boolean(data.student_id)}
        detectedStudentName={data.student_name}
        examPaperPreselected={Boolean(data.exam_paper_id)}
        extractedAnswers={data.extracted_answers ?? []}
        detectedSubject={data.detected_subject}
      />
    );
  }

  if (data.status === "failed") {
    return <FailedStatusCTA data={data} jobId={jobId} />;
  }

  if (data.status === "cancelled") {
    return <CancelledStatusCTA />;
  }

  if (isGradingInProgress) {
    return <LiveGradingPoller jobId={jobId} initialData={data} />;
  }

  return <MarkingJobPoller jobId={jobId} initialStatus={data.status} />;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function MarkResultPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;

  const [result, scanResult] = await Promise.all([
    getStudentPaperResult(jobId),
    getJobScanPageUrls(jobId),
  ]);

  if (!result.ok) notFound();

  const data = result.data;
  const scanPages = scanResult.ok ? scanResult.pages : [];

  if (data.status === "ocr_complete") {
    return (
      <MarkingResultsClient jobId={jobId} data={data} scanPages={scanPages} />
    );
  }

  const isGradingInProgress =
    data.status === "processing" && data.exam_paper_id !== null;

  const { title, subtitle } = deriveHeading(data);

  const showExtractedAnswers =
    !["text_extracted", "failed"].includes(data.status) &&
    !isGradingInProgress &&
    data.extracted_answers !== null &&
    data.extracted_answers.length > 0;

  return (
    <MarkScanTwoColumn scanPages={scanPages}>
      {/* Header */}
      <div>
        <p className="text-sm text-muted-foreground mb-1">
          <Link
            href="/teacher/mark"
            className="hover:underline underline-offset-4"
          >
            ← Mark history
          </Link>
        </p>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {subtitle && (
          <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
        )}
      </div>

      {/* CTA — what to do next, shown before the progress tracker */}
      <StatusCallToAction data={data} jobId={jobId} />

      {/* Pipeline progress — informational, below the action */}
      {data.status !== "cancelled" && <JobTimeline data={data} />}

      {/* Extracted answers — context while grading is queued */}
      {showExtractedAnswers && (
        <div className="rounded-xl border bg-card">
          <div className="px-4 py-3 border-b flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
            <p className="text-sm font-medium">
              Extracted answers ({data.extracted_answers!.length} questions)
            </p>
          </div>
          <div className="divide-y">
            {data.extracted_answers!.map((a) => (
              <div key={a.question_number} className="px-4 py-3 space-y-1">
                <p className="text-xs font-mono text-muted-foreground">
                  Q{a.question_number}
                </p>
                <p className="text-sm whitespace-pre-wrap">
                  {a.answer_text || (
                    <span className="italic text-muted-foreground">
                      No answer
                    </span>
                  )}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center gap-3 flex-wrap">
        <Link
          href="/teacher/mark"
          className={buttonVariants({ variant: "outline" })}
        >
          ← Back to history
        </Link>
        {data.pages_count > 0 && <ReScanButton jobId={jobId} />}
      </div>
    </MarkScanTwoColumn>
  );
}
