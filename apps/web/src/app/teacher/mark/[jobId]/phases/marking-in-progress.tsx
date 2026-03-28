"use client"

import {
	ExamPaperPanel,
	LiveMarkingExamPaperPanel,
} from "@/components/ExamPaperPanel"
import type { StudentPaperJobPayload } from "@/lib/mark-actions"
import { useJobQuery } from "../shared/use-job-query"

const TERMINAL_STATUSES = new Set(["ocr_complete", "failed", "cancelled"])

/**
 * Shown while the marking pipeline is running.
 * Reads live grading results from the shared useJobQuery cache — no manual
 * polling or router.refresh() needed. The query automatically stops polling
 * once a terminal status is reached.
 */
export function MarkingInProgressPanel({
	jobId,
	initialData,
}: {
	jobId: string
	initialData: StudentPaperJobPayload
}) {
	const { data } = useJobQuery(jobId, initialData)
	const liveData = data ?? initialData
	const isGrading = !TERMINAL_STATUSES.has(liveData.status)

	return isGrading ? (
		<LiveMarkingExamPaperPanel
			gradingResults={liveData.grading_results}
			extractedAnswers={liveData.extracted_answers ?? undefined}
		/>
	) : (
		<ExamPaperPanel
			gradingResults={liveData.grading_results}
			extractedAnswers={liveData.extracted_answers ?? undefined}
			examPaperTitle={liveData.exam_paper_title}
		/>
	)
}
