"use client"

import { AnnotatedAnswerSheet } from "@/components/annotated-answer/annotated-answer-sheet"
import { buildAnnotatedDoc } from "@/components/annotated-answer/build-doc"
import {
	type GradingDataContextValue,
	GradingDataProvider,
} from "@/components/annotated-answer/grading-data-context"
import { useYDoc } from "@/components/annotated-answer/use-y-doc"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { useQuestionAlignments } from "@/lib/marking/token-alignment"
import type {
	GradingResult,
	PageToken,
	StudentPaperAnnotation,
	StudentPaperResultPayload,
	TeacherOverride,
	UpsertTeacherOverrideInput,
} from "@/lib/marking/types"
import { useMemo } from "react"

function scoreBadgeVariant(
	awarded: number,
	max: number,
): "default" | "secondary" | "destructive" | "outline" {
	if (max === 0) return "outline"
	const pct = (awarded / max) * 100
	if (pct >= 70) return "default"
	if (pct >= 40) return "secondary"
	return "destructive"
}

export function GradingResultsPanel({
	jobId,
	data,
	answers,
	activeQuestionNumber,
	onAnswerSaved,
	annotations = [],
	pageTokens = [],
	overridesByQuestionId,
	onOverrideChange,
	onDerivedAnnotations,
	onTokenHighlight,
}: {
	jobId: string
	data: StudentPaperResultPayload
	answers: Record<string, string>
	activeQuestionNumber: string | null
	onAnswerSaved: (questionId: string, text: string) => void
	annotations?: StudentPaperAnnotation[]
	pageTokens?: PageToken[]
	overridesByQuestionId?: Map<string, TeacherOverride>
	onOverrideChange?: (
		questionId: string,
		input: UpsertTeacherOverrideInput | null,
	) => void
	onDerivedAnnotations?: (annotations: StudentPaperAnnotation[]) => void
	onTokenHighlight?: (tokenIds: string[] | null) => void
}) {
	// Compute effective totals using overrides where present
	const effectiveTotalAwarded = data.grading_results.reduce((sum, r) => {
		const override = overridesByQuestionId?.get(r.question_id)
		return sum + (override?.score_override ?? r.awarded_score)
	}, 0)

	const hasOverrides = overridesByQuestionId && overridesByQuestionId.size > 0

	const scorePercent =
		data.total_max > 0
			? Math.round((effectiveTotalAwarded / data.total_max) * 100)
			: 0

	// Compute alignment data for the answer sheet
	const { marksByQuestion, alignmentByQuestion, tokensByQuestion } =
		useQuestionAlignments(data.grading_results, annotations, pageTokens)

	// Build PM document from grading results + alignment marks + token data.
	// When grading results are absent but exam paper questions are available,
	// skeleton blocks are built from the paper structure so the teacher sees
	// the question layout while processing is underway.
	const doc = useMemo(
		() =>
			buildAnnotatedDoc(
				data.grading_results,
				marksByQuestion,
				alignmentByQuestion,
				tokensByQuestion,
				data.examiner_summary,
				data.exam_paper_questions,
				data.extracted_answers,
			),
		[
			data.grading_results,
			marksByQuestion,
			alignmentByQuestion,
			tokensByQuestion,
			data.examiner_summary,
			data.exam_paper_questions,
			data.extracted_answers,
		],
	)

	// Build grading results lookup map for context
	const gradingResultsMap = useMemo(() => {
		const map = new Map<string, GradingResult>()
		for (const r of data.grading_results) {
			map.set(r.question_id, r)
		}
		return map
	}, [data.grading_results])

	// Build context value — consumed by NodeViews via useGradingData()
	const ctxValue: GradingDataContextValue = useMemo(
		() => ({
			gradingResults: gradingResultsMap,
			answers,
			overridesByQuestionId: overridesByQuestionId ?? new Map(),
			activeQuestionNumber,
			jobId,
			onAnswerSaved,
			onOverrideChange: onOverrideChange ?? (() => {}),
		}),
		[
			gradingResultsMap,
			answers,
			overridesByQuestionId,
			activeQuestionNumber,
			jobId,
			onAnswerSaved,
			onOverrideChange,
		],
	)

	// Hide the score bar until grading has produced real totals. Once
	// grading completes, total_max becomes non-zero and the bar appears.
	const showScoreBar = data.total_max > 0

	// Collaborative Y.Doc keyed by submission_id (falls back to jobId for
	// legacy jobs that predate the Submission model). The hook owns lifecycle:
	// IndexedDB offline cache + HocuspocusProvider sync + clean teardown.
	const docKey = data.submission_id ?? jobId
	const { doc: ydoc, synced } = useYDoc(docKey)

	return (
		<div className="space-y-4">
			{showScoreBar && (
				<div className="flex items-center gap-3 px-1">
					<Badge
						variant={scoreBadgeVariant(effectiveTotalAwarded, data.total_max)}
						className="text-xs px-2 py-0.5 shrink-0"
					>
						{effectiveTotalAwarded} / {data.total_max}
					</Badge>
					<Progress value={scorePercent} className="h-1.5 flex-1" />
					<span className="text-xs text-muted-foreground tabular-nums shrink-0">
						{scorePercent}%
					</span>
					{hasOverrides && (
						<span className="text-[10px] text-blue-500 shrink-0">Adjusted</span>
					)}
				</div>
			)}

			{/* Answer sheet — gated on Y.Doc sync so AI annotations applied
			    server-side don't race an empty initial doc. */}
			<GradingDataProvider value={ctxValue}>
				{ydoc && synced ? (
					<AnnotatedAnswerSheet
						ydoc={ydoc}
						doc={doc}
						onDerivedAnnotations={onDerivedAnnotations}
						onTokenHighlight={onTokenHighlight}
					/>
				) : (
					<div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
						Loading annotations…
					</div>
				)}
			</GradingDataProvider>
		</div>
	)
}
