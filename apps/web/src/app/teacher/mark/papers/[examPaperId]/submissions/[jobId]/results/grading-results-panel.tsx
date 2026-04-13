"use client"

import { AnnotatedAnswerSheet } from "@/components/annotated-answer/annotated-answer-sheet"
import { buildAnnotatedDoc } from "@/components/annotated-answer/build-doc"
import {
	type GradingDataContextValue,
	GradingDataProvider,
} from "@/components/annotated-answer/grading-data-context"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
	hoveredTokenId,
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
	hoveredTokenId?: string | null
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

	// Build PM document from grading results + alignment marks
	const doc = useMemo(
		() => buildAnnotatedDoc(data.grading_results, marksByQuestion),
		[data.grading_results, marksByQuestion],
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
		<div className="space-y-5">
			{/* Score summary */}
			<Card>
				<CardHeader className="pb-3">
					<CardTitle className="flex items-center justify-between text-base">
						<span>Total score</span>
						<Badge
							variant={scoreBadgeVariant(effectiveTotalAwarded, data.total_max)}
							className="text-sm px-2.5 py-0.5"
						>
							{effectiveTotalAwarded} / {data.total_max}
						</Badge>
					</CardTitle>
				</CardHeader>
				<CardContent>
					<Progress value={scorePercent} className="h-2.5" />
					<div className="mt-1.5 flex items-center justify-between">
						{hasOverrides && (
							<p className="text-[10px] text-blue-500">
								Includes teacher adjustments (AI: {data.total_awarded}/
								{data.total_max})
							</p>
						)}
						<p className="text-xs text-muted-foreground text-right ml-auto">
							{scorePercent}%
						</p>
					</div>
				</CardContent>
			</Card>

			{/* Examiner summary */}
			{data.examiner_summary && (
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm">Examiner Summary</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
							{data.examiner_summary}
						</p>
					</CardContent>
				</Card>
			)}

			{/* Question breakdown — always the answer sheet */}
			<div>
				<h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
					Question breakdown
				</h2>
				{data.grading_results.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						No questions were graded.
					</p>
				) : (
					<GradingDataProvider value={ctxValue}>
						<AnnotatedAnswerSheet
							doc={doc}
							alignmentByQuestion={alignmentByQuestion}
							tokensByQuestion={tokensByQuestion}
							onDerivedAnnotations={onDerivedAnnotations}
							hoveredTokenId={hoveredTokenId}
							onTokenHighlight={onTokenHighlight}
						/>
					</GradingDataProvider>
				)}
			</div>
		</div>
	)
}
