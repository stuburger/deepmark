"use client"

import { AnnotatedAnswerSheet } from "@/components/annotated-answer/annotated-answer-sheet"
import {
	type GradingDataContextValue,
	GradingDataProvider,
} from "@/components/annotated-answer/grading-data-context"
import { useDocHasQuestionBlocks } from "@/components/annotated-answer/use-doc-has-question-blocks"
import { useYDoc } from "@/components/annotated-answer/use-y-doc"
import { OrganicMarkingLoader } from "@/components/marking-loader"
import type {
	GradingResult,
	StudentPaperAnnotation,
	StudentPaperResultPayload,
	TeacherOverride,
} from "@/lib/marking/types"
import { LockKeyhole } from "lucide-react"
import { useMemo } from "react"

export function GradingResultsPanel({
	jobId,
	data,
	answers,
	activeQuestionNumber,
	onAnswerSaved,
	overridesByQuestionId,
	onDerivedAnnotations,
	onTokenHighlight,
	onAskDeepMark,
}: {
	jobId: string
	data: StudentPaperResultPayload
	answers: Record<string, string>
	activeQuestionNumber: string | null
	onAnswerSaved: (questionId: string, text: string) => void
	overridesByQuestionId?: Map<string, TeacherOverride>
	onDerivedAnnotations?: (annotations: StudentPaperAnnotation[]) => void
	onTokenHighlight?: (tokenIds: string[] | null) => void
	onAskDeepMark?: (input: {
		text: string
		questionNumber: string | null
	}) => void
}) {
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
		// Answer sheet — gated on Y.Doc sync so AI annotations applied
		// server-side don't race an empty initial doc.
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
						onAskDeepMark={onAskDeepMark}
					/>
				)
			)}
		</GradingDataProvider>
	)
}
