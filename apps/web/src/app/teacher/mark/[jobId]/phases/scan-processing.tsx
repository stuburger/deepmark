"use client"

import { Loader2 } from "lucide-react"
import { useJobQuery } from "../shared/use-job-query"

const STATUS_LABELS: Record<string, string> = {
	pending: "Queued — waiting to start",
	processing: "Reading pages…",
	extracting: "Extracting text from scan…",
	extracted: "Text extracted",
	grading: "Marking answers against the mark scheme…",
}

/**
 * Shown while the scan is being processed by OCR.
 * Reads live status from the shared useJobQuery cache — no manual polling needed.
 */
export function ScanProcessingPanel({
	jobId,
	initialStatus,
}: {
	jobId: string
	initialStatus: string
}) {
	const { data } = useJobQuery(jobId)
	const status = data?.status ?? initialStatus
	const label = STATUS_LABELS[status] ?? `Processing (${status})`

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
	)
}
