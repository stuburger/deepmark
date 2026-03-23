"use client"

import type { StudentPaperJobPayload } from "@/lib/mark-actions"
import { CancelledPanel } from "./phases/cancelled"
import { FailedPanel } from "./phases/failed"
import { MarkingInProgressPanel } from "./phases/marking-in-progress"
import { MarkingResults } from "./phases/results/index"
import { ScanProcessingPanel } from "./phases/scan-processing"
import type { MarkingPhase } from "./shared/phase"

export function DigitalTabContent({
	jobId,
	data,
	phase,
}: {
	jobId: string
	data: StudentPaperJobPayload
	phase: MarkingPhase
}) {
	switch (phase) {
		case "scan_processing":
			return <ScanProcessingPanel jobId={jobId} initialStatus={data.status} />

		case "marking_in_progress":
			return <MarkingInProgressPanel jobId={jobId} initialData={data} />

		case "completed":
			return <MarkingResults jobId={jobId} data={data} />

		case "failed":
			return <FailedPanel data={data} jobId={jobId} />

		case "cancelled":
			return <CancelledPanel />
	}
}
