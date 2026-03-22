"use client"

import type { StudentPaperJobPayload } from "@/lib/mark-actions"
import { Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback } from "react"
import { useJobPoller } from "../shared/use-job-poller"

const STATUS_LABELS: Record<string, string> = {
	pending: "Queued — waiting to start",
	processing: "Reading pages…",
	extracting: "Extracting text from scan…",
	extracted: "Text extracted",
	grading: "Marking answers against the mark scheme…",
}

/**
 * Shown while the scan is being processed by OCR (pending / processing states).
 * Polls every 5 seconds and triggers a server refresh when the status changes.
 */
export function ScanProcessingPanel({
	jobId,
	initialStatus,
}: {
	jobId: string
	initialStatus: string
}) {
	const router = useRouter()

	const handleResult = useCallback(
		(data: StudentPaperJobPayload) => {
			if (data.status !== initialStatus) {
				router.refresh()
			}
		},
		[initialStatus, router],
	)

	const POLLING_STATUSES = new Set(["pending", "processing", "grading"])

	useJobPoller({
		jobId,
		intervalMs: 5000,
		enabled: POLLING_STATUSES.has(initialStatus),
		onResult: handleResult,
	})

	const label = STATUS_LABELS[initialStatus] ?? `Processing (${initialStatus})`

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
