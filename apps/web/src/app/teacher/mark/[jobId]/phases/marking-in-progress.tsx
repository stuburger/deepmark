"use client"

import { ExamPaperPanel } from "@/components/ExamPaperPanel"
import type { GradingResult, StudentPaperJobPayload } from "@/lib/mark-actions"
import { useRouter } from "next/navigation"
import { useCallback, useState } from "react"
import { useJobPoller } from "../shared/use-job-poller"

const TERMINAL_STATUSES = new Set(["ocr_complete", "failed", "cancelled"])

/**
 * Shown while the marking pipeline is running.
 * Polls every 2 seconds and streams grading results live as they arrive.
 * Calls router.refresh() when the job reaches a terminal state, which
 * causes the server to re-derive the phase as completed/failed/cancelled.
 */
export function MarkingInProgressPanel({
	jobId,
	initialData,
}: {
	jobId: string
	initialData: StudentPaperJobPayload
}) {
	const router = useRouter()
	const [gradingResults, setGradingResults] = useState<GradingResult[]>(
		initialData.grading_results,
	)
	const [status, setStatus] = useState(initialData.status)

	const handleResult = useCallback(
		(data: StudentPaperJobPayload) => {
			if (data.grading_results.length > gradingResults.length) {
				setGradingResults(data.grading_results)
			}
			if (data.status !== status) {
				setStatus(data.status)
			}
			if (TERMINAL_STATUSES.has(data.status)) {
				router.refresh()
			}
		},
		// gradingResults.length intentional — only re-create when count changes
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[gradingResults.length, status, router],
	)

	useJobPoller({
		jobId,
		intervalMs: 2000,
		enabled: !TERMINAL_STATUSES.has(status),
		onResult: handleResult,
	})

	const isGrading = !TERMINAL_STATUSES.has(status)

	return (
		<ExamPaperPanel
			gradingResults={gradingResults}
			extractedAnswers={initialData.extracted_answers ?? undefined}
			isGrading={isGrading}
			examPaperTitle={initialData.exam_paper_title}
		/>
	)
}
