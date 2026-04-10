"use client"

import { LiveMarkingExamPaperPanel } from "@/components/ExamPaperPanel"
import { ScrollArea } from "@/components/ui/scroll-area"
import type {
	StudentPaperAnnotation,
	StudentPaperJobPayload,
	TeacherOverride,
	UpsertTeacherOverrideInput,
} from "@/lib/marking/types"
import { Loader2 } from "lucide-react"
import { CancelledPanel } from "./cancelled"
import { FailedPanel } from "./failed"
import type { MarkingPhase } from "./phase"
import { MarkingResults } from "./results/index"

const STATUS_LABELS: Record<string, string> = {
	pending: "Queued — waiting to start",
	processing: "Reading pages…",
	extracting: "Extracting text from scan…",
	extracted: "Text extracted",
	grading: "Marking answers against the mark scheme…",
}

function ScanProcessingDisplay({ status }: { status: string }) {
	const label = STATUS_LABELS[status] ?? `Processing (${status})`
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
	)
}

function DigitalPanelContent({
	jobId,
	data,
	phase,
	activeQuestionNumber,
	annotations = [],
	overridesByQuestionId,
	onOverrideChange,
}: {
	jobId: string
	data: StudentPaperJobPayload
	phase: MarkingPhase
	activeQuestionNumber: string | null
	annotations?: StudentPaperAnnotation[]
	overridesByQuestionId?: Map<string, TeacherOverride>
	onOverrideChange?: (
		questionId: string,
		input: UpsertTeacherOverrideInput | null,
	) => void
}) {
	switch (phase) {
		case "scan_processing":
			return <ScanProcessingDisplay status={data.status} />

		case "marking_in_progress":
			return (
				<LiveMarkingExamPaperPanel
					gradingResults={data.grading_results}
					extractedAnswers={data.extracted_answers ?? undefined}
					activeQuestionNumber={activeQuestionNumber}
				/>
			)

		case "completed":
			return (
				<MarkingResults
					jobId={jobId}
					data={data}
					activeQuestionNumber={activeQuestionNumber}
					annotations={annotations}
					overridesByQuestionId={overridesByQuestionId}
					onOverrideChange={onOverrideChange}
				/>
			)

		case "failed":
			return <FailedPanel data={data} jobId={jobId} />

		case "cancelled":
			return <CancelledPanel />
	}
}

export function ResultsPanel({
	jobId,
	data,
	phase,
	activeQuestionNumber,
	annotations = [],
	overridesByQuestionId,
	onOverrideChange,
}: {
	jobId: string
	data: StudentPaperJobPayload
	phase: MarkingPhase
	activeQuestionNumber: string | null
	annotations?: StudentPaperAnnotation[]
	overridesByQuestionId?: Map<string, TeacherOverride>
	onOverrideChange?: (
		questionId: string,
		input: UpsertTeacherOverrideInput | null,
	) => void
}) {
	return (
		<ScrollArea data-results-panel className="h-full w-full">
			<div className="p-4 space-y-5 max-w-2xl w-full">
				<DigitalPanelContent
					jobId={jobId}
					data={data}
					phase={phase}
					activeQuestionNumber={activeQuestionNumber}
					annotations={annotations}
					overridesByQuestionId={overridesByQuestionId}
					onOverrideChange={onOverrideChange}
				/>
			</div>
		</ScrollArea>
	)
}
