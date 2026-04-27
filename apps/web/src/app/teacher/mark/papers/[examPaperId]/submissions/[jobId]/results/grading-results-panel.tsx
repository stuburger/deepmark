"use client"

import { AnnotatedAnswerSheet } from "@/components/annotated-answer/annotated-answer-sheet"
import {
	type GradingDataContextValue,
	GradingDataProvider,
} from "@/components/annotated-answer/grading-data-context"
import { useDocHasQuestionBlocks } from "@/components/annotated-answer/use-doc-has-question-blocks"
import { useYDoc } from "@/components/annotated-answer/use-y-doc"
import { OrganicMarkingLoader } from "@/components/marking-loader"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import type {
	GradingResult,
	StudentPaperAnnotation,
	StudentPaperResultPayload,
	TeacherOverride,
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
	overridesByQuestionId,
	onDerivedAnnotations,
	onTokenHighlight,
}: {
	jobId: string
	data: StudentPaperResultPayload
	answers: Record<string, string>
	activeQuestionNumber: string | null
	onAnswerSaved: (questionId: string, text: string) => void
	overridesByQuestionId?: Map<string, TeacherOverride>
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

	// Build grading results lookup map for context
	const gradingResultsMap = useMemo(() => {
		const map = new Map<string, GradingResult>()
		for (const r of data.grading_results) {
			map.set(r.question_id, r)
		}
		return map
	}, [data.grading_results])

	// Build context value — consumed by NodeViews via useGradingData()
	// for read-side state. Write ops (override, feedback bullets) come from
	// `useDocOps()` instead (see DocOpsProvider in submission-view).
	const ctxValue: GradingDataContextValue = useMemo(
		() => ({
			gradingResults: gradingResultsMap,
			answers,
			overridesByQuestionId: overridesByQuestionId ?? new Map(),
			activeQuestionNumber,
			jobId,
			onAnswerSaved,
		}),
		[
			gradingResultsMap,
			answers,
			overridesByQuestionId,
			activeQuestionNumber,
			jobId,
			onAnswerSaved,
		],
	)

	// Hide the score bar until grading has produced real totals. Once
	// grading completes, total_max becomes non-zero and the bar appears.
	const showScoreBar = data.total_max > 0

	// Collaborative Y.Doc keyed by submission_id (falls back to jobId for
	// legacy jobs that predate the Submission model). The hook owns lifecycle:
	// IndexedDB offline cache + HocuspocusProvider sync + clean teardown.
	const docKey = data.submission_id ?? jobId
	const { doc: ydoc, provider, synced } = useYDoc(docKey)
	const hasBlocks = useDocHasQuestionBlocks(ydoc)
	// Show the marking loader until the OCR Lambda has projected the question
	// skeleton. Without this, the editor mounts as soon as the empty doc syncs
	// and the user sees blank white space mid-extraction.
	const showLoader = !ydoc || !synced || !hasBlocks

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
				{showLoader ? (
					<div className="flex h-[60vh] items-center justify-center">
						<OrganicMarkingLoader />
					</div>
				) : (
					ydoc && (
						<AnnotatedAnswerSheet
							ydoc={ydoc}
							provider={provider}
							onDerivedAnnotations={onDerivedAnnotations}
							onTokenHighlight={onTokenHighlight}
						/>
					)
				)}
			</GradingDataProvider>
		</div>
	)
}
