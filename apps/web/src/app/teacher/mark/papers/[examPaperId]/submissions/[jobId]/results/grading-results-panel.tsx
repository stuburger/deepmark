"use client"

import { AnnotatedAnswerSheet } from "@/components/annotated-answer/annotated-answer-sheet"
import { buildAnnotatedDoc } from "@/components/annotated-answer/build-doc"
import {
	type GradingDataContextValue,
	GradingDataProvider,
} from "@/components/annotated-answer/grading-data-context"
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

	// Build PM document from grading results + alignment marks + token data
	const doc = useMemo(
		() =>
			buildAnnotatedDoc(
				data.grading_results,
				marksByQuestion,
				alignmentByQuestion,
				tokensByQuestion,
			),
		[
			data.grading_results,
			marksByQuestion,
			alignmentByQuestion,
			tokensByQuestion,
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
			isEditing: !!onOverrideChange,
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

	return (
		<div className="space-y-4">
			{/* Compact score bar */}
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

			{/* Examiner summary — compact */}
			{data.examiner_summary && (
				<p className="text-xs text-muted-foreground leading-relaxed px-1">
					{data.examiner_summary}
				</p>
			)}

			{/* Answer sheet — the document */}
			{data.grading_results.length === 0 ? (
				<p className="text-sm text-muted-foreground px-1">
					No questions were graded.
				</p>
			) : (
				<GradingDataProvider value={ctxValue}>
					<AnnotatedAnswerSheet
						doc={doc}
						onDerivedAnnotations={onDerivedAnnotations}
						onTokenHighlight={onTokenHighlight}
					/>
				</GradingDataProvider>
			)}
		</div>
	)
}
