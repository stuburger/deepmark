"use client"

import { AnnotatedAnswerSheet } from "@/components/annotated-answer/annotated-answer-sheet"
import {
	type GradingDataContextValue,
	GradingDataProvider,
} from "@/components/annotated-answer/grading-data-context"
import { useYDoc } from "@/components/annotated-answer/use-y-doc"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import type {
	GradingResult,
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

function OrganicDocumentLoader() {
	return (
		<svg
			aria-hidden="true"
			className="h-14 w-14 text-blue-500"
			viewBox="0 0 96 96"
			fill="none"
		>
			<title>Loading document</title>
			<path
				d="M28 18C28 13.5817 31.5817 10 36 10H58L72 24V78C72 82.4183 68.4183 86 64 86H36C31.5817 86 28 82.4183 28 78V18Z"
				className="fill-blue-500/10 stroke-current"
				strokeWidth="3"
			/>
			<path
				d="M58 10V22C58 23.1046 58.8954 24 60 24H72"
				className="stroke-current opacity-60"
				strokeWidth="3"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M37 38C43 33 51 43 59 37"
				className="stroke-current"
				strokeWidth="3"
				strokeLinecap="round"
			>
				<animate
					attributeName="d"
					dur="2.4s"
					repeatCount="indefinite"
					values="M37 38C43 33 51 43 59 37;M37 38C43 43 51 33 59 39;M37 38C43 33 51 43 59 37"
				/>
			</path>
			<path
				d="M36 52C44 47 52 57 60 52"
				className="stroke-current opacity-70"
				strokeWidth="3"
				strokeLinecap="round"
			>
				<animate
					attributeName="d"
					dur="2.8s"
					repeatCount="indefinite"
					values="M36 52C44 47 52 57 60 52;M36 52C44 58 52 47 60 53;M36 52C44 47 52 57 60 52"
				/>
			</path>
			<circle cx="48" cy="68" r="4" className="fill-current">
				<animate
					attributeName="r"
					dur="1.6s"
					repeatCount="indefinite"
					values="3;5;3"
				/>
				<animate
					attributeName="opacity"
					dur="1.6s"
					repeatCount="indefinite"
					values="0.35;0.9;0.35"
				/>
			</circle>
		</svg>
	)
}

export function GradingResultsPanel({
	jobId,
	data,
	answers,
	activeQuestionNumber,
	onAnswerSaved,
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
						onDerivedAnnotations={onDerivedAnnotations}
						onTokenHighlight={onTokenHighlight}
					/>
				) : (
					<div className="flex flex-col items-center justify-center gap-3 py-20 text-sm text-muted-foreground">
						<OrganicDocumentLoader />
						<span>Loading document...</span>
					</div>
				)}
			</GradingDataProvider>
		</div>
	)
}
