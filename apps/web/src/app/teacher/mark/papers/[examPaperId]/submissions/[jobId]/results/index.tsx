"use client"

import type {
	PageToken,
	StudentPaperAnnotation,
	StudentPaperJobPayload,
	TeacherOverride,
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
	annotations,
	pageTokens,
	activeQuestionNumber,
	overridesByQuestionId,
	onDerivedAnnotations,
	onTokenHighlight,
	onAskDeepMark,
	toolbarSlot,
	aoOpen,
}: {
	jobId: string
	data: StudentPaperJobPayload
	annotations: StudentPaperAnnotation[]
	pageTokens: PageToken[]
	activeQuestionNumber?: string | null
	overridesByQuestionId?: Map<string, TeacherOverride>
	onDerivedAnnotations?: (annotations: StudentPaperAnnotation[]) => void
	onTokenHighlight?: (tokenIds: string[] | null) => void
	onAskDeepMark?: (input: {
		text: string
		questionNumber: string | null
	}) => void
	toolbarSlot?: HTMLElement | null
	aoOpen?: boolean
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
			annotations={annotations}
			pageTokens={pageTokens}
			activeQuestionNumber={activeQuestionNumber ?? null}
			onAnswerSaved={(id, text) =>
				setAnswers((prev) => ({ ...prev, [id]: text }))
			}
			overridesByQuestionId={overridesByQuestionId}
			onDerivedAnnotations={onDerivedAnnotations}
			onTokenHighlight={onTokenHighlight}
			onAskDeepMark={onAskDeepMark}
			toolbarSlot={toolbarSlot}
			aoOpen={aoOpen}
		/>
	)
}
