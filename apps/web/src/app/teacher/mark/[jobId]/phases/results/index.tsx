"use client"

import type {
	StudentPaperAnnotation,
	StudentPaperJobPayload,
} from "@/lib/marking/types"
import { useState } from "react"
import { GradingResultsPanel } from "./grading-results-panel"

/**
 * Digital tab content for the completed phase.
 * Manages local answer edits and renders the full grading breakdown.
 * The scan view (with annotated pages) lives in the Scan tab of UnifiedMarkingLayout.
 */
export function MarkingResults({
	jobId,
	data,
	activeQuestionNumber,
	annotations = [],
}: {
	jobId: string
	data: StudentPaperJobPayload
	activeQuestionNumber?: string | null
	annotations?: StudentPaperAnnotation[]
}) {
	const [answers, setAnswers] = useState<Record<string, string>>(
		Object.fromEntries(
			data.grading_results.map((r) => [r.question_id, r.student_answer]),
		),
	)

	return (
		<GradingResultsPanel
			jobId={jobId}
			data={data}
			answers={answers}
			activeQuestionNumber={activeQuestionNumber ?? null}
			onAnswerSaved={(id, text) =>
				setAnswers((prev) => ({ ...prev, [id]: text }))
			}
			annotations={annotations}
		/>
	)
}
