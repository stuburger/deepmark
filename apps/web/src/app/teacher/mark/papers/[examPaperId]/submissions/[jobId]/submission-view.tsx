"use client";

import { LiveMarkingExamPaperPanel } from "@/components/ExamPaperPanel";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ScanPageUrl, StudentPaperJobPayload } from "@/lib/mark-actions";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { CancelledPanel } from "../../../../[jobId]/phases/cancelled";
import { FailedPanel } from "../../../../[jobId]/phases/failed";
import { AnnotatedScanColumn } from "../../../../[jobId]/phases/results/annotated-scan-column";

import { MarkingResults } from "../../../../[jobId]/phases/results/index";
import {
  type MarkingPhase,
  derivePhase,
} from "../../../../[jobId]/shared/phase";
import { useJobPoller } from "../../../../[jobId]/shared/use-job-poller";
import { EventLog } from "./event-log";
import { SubmissionToolbar } from "./submission-toolbar";

const TERMINAL_STATUSES = new Set(["ocr_complete", "failed", "cancelled"]);

// ─── Status label for scan-processing display ─────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  pending: "Queued — waiting to start",
  processing: "Reading pages…",
  extracting: "Extracting text from scan…",
  extracted: "Text extracted",
  grading: "Marking answers against the mark scheme…",
};

function ScanProcessingDisplay({ status }: { status: string }) {
  const label = STATUS_LABELS[status] ?? `Processing (${status})`;
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3">
      <Loader2 className="h-5 w-5 text-primary animate-spin shrink-0" />
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Updating automatically…
        </p>
      </div>
    </div>
  );
}

// ─── Right panel: phase-switched digital paper content ────────────────────────

function DigitalPanelContent({
  jobId,
  data,
  phase,
  activeQuestionNumber,
}: {
  jobId: string;
  data: StudentPaperJobPayload;
  phase: MarkingPhase;
  activeQuestionNumber: string | null;
}) {
  switch (phase) {
    case "scan_processing":
      return <ScanProcessingDisplay status={data.status} />;

    case "marking_in_progress":
      return (
        <LiveMarkingExamPaperPanel
          gradingResults={data.grading_results}
          extractedAnswers={data.extracted_answers ?? undefined}
          activeQuestionNumber={activeQuestionNumber}
        />
      );

    case "completed":
      return (
        <MarkingResults
          jobId={jobId}
          data={data}
          activeQuestionNumber={activeQuestionNumber}
        />
      );

    case "failed":
      return <FailedPanel data={data} jobId={jobId} />;

    case "cancelled":
      return <CancelledPanel />;
  }
}

// ─── Shared scan panel ────────────────────────────────────────────────────────

function ScanPanel({
  scanPages,
  gradingResults,
  showOcr,
  showRegions,
  onAnnotationClick,
}: {
  scanPages: ScanPageUrl[];
  gradingResults: StudentPaperJobPayload["grading_results"];
  showOcr: boolean;
  showRegions: boolean;
  onAnnotationClick?: (questionNumber: string) => void;
}) {
  return (
    <div className="h-full overflow-y-auto bg-muted/20">
      <AnnotatedScanColumn
        pages={scanPages}
        showHighlights={showOcr}
        showRegions={showRegions}
        gradingResults={gradingResults}
        onAnnotationClick={onAnnotationClick}
      />
    </div>
  );
}

// ─── Shared results panel ─────────────────────────────────────────────────────

function ResultsPanel({
  jobId,
  data,
  phase,
  isPolling,
  activeQuestionNumber,
}: {
  jobId: string;
  data: StudentPaperJobPayload;
  phase: MarkingPhase;
  isPolling: boolean;
  activeQuestionNumber: string | null;
}) {
  return (
    <div data-results-panel className="h-full overflow-y-auto flex flex-col">
      <div className="flex-1 p-4 space-y-5 max-w-2xl w-full">
        <DigitalPanelContent
          jobId={jobId}
          data={data}
          phase={phase}
          activeQuestionNumber={activeQuestionNumber}
        />
      </div>
      <EventLog events={data.job_events} isPolling={isPolling} />
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

export function SubmissionView({
  examPaperId,
  jobId,
  initialData,
  scanPages,
  initialPhase,
}: {
  examPaperId: string;
  jobId: string;
  initialData: StudentPaperJobPayload;
  scanPages: ScanPageUrl[];
  initialPhase: MarkingPhase;
}) {
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [showOcr, setShowOcr] = useState(false);
  const [showRegions, setShowRegions] = useState(true);
  const [activeQuestionNumber, setActiveQuestionNumber] = useState<
    string | null
  >(null);

  const phase = derivePhase(data);
  const isTerminal = TERMINAL_STATUSES.has(data.status);
  const isPolling = !isTerminal;

  const intervalMs = phase === "marking_in_progress" ? 2000 : 5000;

  const handleResult = useCallback((fresh: StudentPaperJobPayload) => {
    setData(fresh);
  }, []);

  // When OCR completes and the phase moves from scan_processing →
  // marking_in_progress, the server has just written page_analyses to the DB.
  // Calling router.refresh() re-runs the server component so scanPages comes
  // back with page.analysis populated — no manual refresh needed by the teacher.
  const prevPhaseRef = useRef(initialPhase);
  useEffect(() => {
    if (
      prevPhaseRef.current === "scan_processing" &&
      phase === "marking_in_progress"
    ) {
      router.refresh();
    }
    prevPhaseRef.current = phase;
  }, [phase, router]);

  useJobPoller({
    jobId,
    intervalMs,
    enabled: isPolling,
    onResult: handleResult,
  });

  const scrollToQuestion = useCallback((questionNumber: string) => {
    setActiveQuestionNumber(questionNumber);
    // Find the panel first, then scope the element query within it.
    // Both mobile and desktop layouts render DigitalPanelContent simultaneously
    // (one is CSS-hidden), so there are duplicate IDs in the DOM. Querying
    // within the panel guarantees we target the visible desktop element.
    const panel = document.querySelector(
      "[data-results-panel]"
    ) as HTMLElement | null;
    if (!panel) return;
    const el = panel.querySelector(
      `[id="question-${questionNumber}"]`
    ) as HTMLElement | null;
    if (!el) return;
    const panelRect = panel.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    panel.scrollTo({
      top: panel.scrollTop + (elRect.top - panelRect.top) - 16,
      behavior: "smooth",
    });
  }, []);

  return (
    <div className="-m-6 flex flex-col overflow-hidden h-dvh">
      <SubmissionToolbar
        examPaperId={examPaperId}
        jobId={jobId}
        data={data}
        phase={phase}
        scanPages={scanPages}
        showOcr={showOcr}
        showRegions={showRegions}
        onToggleOcr={() => setShowOcr((v) => !v)}
        onToggleRegions={() => setShowRegions((v) => !v)}
      />

      {/* Mobile: scan/results tabs */}
      <div className="flex-1 min-h-0 flex flex-col md:hidden">
        <Tabs
          defaultValue={
            initialPhase === "completed" ||
            initialPhase === "failed" ||
            initialPhase === "cancelled"
              ? "results"
              : "scan"
          }
          className="h-full flex flex-col overflow-hidden gap-0"
        >
          <TabsList
            variant="line"
            className="shrink-0 w-full justify-start rounded-none border-b px-4 h-9 gap-4"
          >
            <TabsTrigger value="scan">Scan</TabsTrigger>
            <TabsTrigger value="results">Results</TabsTrigger>
          </TabsList>

          <TabsContent
            value="scan"
            className="flex-1 overflow-y-auto bg-muted/20 m-0 p-0"
          >
            <AnnotatedScanColumn
              pages={scanPages}
              showHighlights={showOcr}
              showRegions={showRegions}
              gradingResults={data.grading_results}
              onAnnotationClick={scrollToQuestion}
            />
          </TabsContent>

          <TabsContent value="results" className="flex-1 overflow-y-auto m-0">
            <div className="p-4 space-y-5 max-w-2xl">
              <DigitalPanelContent
                jobId={jobId}
                data={data}
                phase={phase}
                activeQuestionNumber={activeQuestionNumber}
              />
            </div>
            <EventLog events={data.job_events} isPolling={isPolling} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Desktop: persistent split layout */}
      <ResizablePanelGroup
        orientation="horizontal"
        className="flex-1 min-h-0 hidden md:flex"
      >
        <ResizablePanel defaultSize={55} minSize={35}>
          <ScanPanel
            scanPages={scanPages}
            gradingResults={data.grading_results}
            showOcr={showOcr}
            showRegions={showRegions}
            onAnnotationClick={scrollToQuestion}
          />
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize={45} minSize={30}>
          <ResultsPanel
            jobId={jobId}
            data={data}
            phase={phase}
            isPolling={isPolling}
            activeQuestionNumber={activeQuestionNumber}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
