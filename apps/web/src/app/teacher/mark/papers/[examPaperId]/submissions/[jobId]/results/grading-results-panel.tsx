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
import { LockKeyhole } from "lucide-react"
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
	const { doc: ydoc, provider, synced, authFailed } = useYDoc(docKey)
	const hasBlocks = useDocHasQuestionBlocks(ydoc)
	// Three pre-editor states, in order of precedence:
	//   - authFailed: collab server rejected the token; render terminal error.
	//   - !synced: provider still hydrating IDB / WebSocket — user-facing
	//     copy is "Loading", not "Marking" (nothing's being marked yet).
	//   - synced && !hasBlocks: server-side OCR pipeline hasn't projected the
	//     question skeleton yet — the actual "Marking" state.
	const editorState: "auth-failed" | "loading" | "marking" | "ready" =
		authFailed
			? "auth-failed"
			: !ydoc || !synced
				? "loading"
				: !hasBlocks
					? "marking"
					: "ready"

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
						<span className="text-[10px] text-primary shrink-0">Adjusted</span>
					)}
				</div>
			)}

			{/* Answer sheet — gated on Y.Doc sync so AI annotations applied
			    server-side don't race an empty initial doc. */}
			<GradingDataProvider value={ctxValue}>
				{editorState === "auth-failed" ? (
					<div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-center">
						<LockKeyhole className="h-10 w-10 text-muted-foreground" />
						<div className="space-y-1">
							<p className="text-sm font-medium">Access denied</p>
							<p className="text-xs text-muted-foreground max-w-sm">
								The collaboration server rejected your session for this
								submission. Ask the owner to re-share it with you.
							</p>
						</div>
					</div>
				) : editorState === "loading" ? (
					<div className="flex h-[60vh] items-center justify-center">
						<OrganicMarkingLoader label="Loading" />
					</div>
				) : editorState === "marking" ? (
					<div className="flex h-[60vh] items-center justify-center">
						<OrganicMarkingLoader label="Marking" />
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
