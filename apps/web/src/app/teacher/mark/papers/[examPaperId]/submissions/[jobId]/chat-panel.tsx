"use client"

import { useEditorHandle } from "@/components/annotated-answer/editor-handle-context"
import {
	applyAnnotationByPhrase,
	removeAnnotationById,
	updateAnnotationById,
} from "@/components/annotated-answer/talk-tool-actions"
import { useLinkToScan } from "@/components/talk/link-to-scan-context"
import type { OverrideContextEntry } from "@/components/talk/override-confirm-card"
import { TalkToDeepMarkChat } from "@/components/talk/talk-to-deepmark-chat"
import type { ToolDispatchResult } from "@/components/talk/talk-to-deepmark-chat"
import type { TalkUIMessage } from "@/components/talk/types"
import { Button } from "@/components/ui/button"
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import { upsertTeacherOverride } from "@/lib/marking/overrides/mutations"
import type { GradingResult } from "@/lib/marking/types"
import { useEditorAutoResume } from "@/lib/talk/conversations/use-auto-resume"
import type {
	AddAnnotationInput,
	ProposeTeacherOverrideInput,
	RemoveAnnotationInput,
	UpdateAnnotationInput,
} from "@/lib/talk/tools"
import { FileText, Sparkles } from "lucide-react"
import { useCallback, useMemo } from "react"

/**
 * Editor-side chat panel — thin shell around TalkToDeepMarkChat. Owns the
 * sidebar header (switch-to-scan + DeepMark label) and builds the tool-
 * call dispatchers using the editor handle from EditorHandleProvider.
 *
 * Selection-driven context: the host pushes a {text, questionNumber, …}
 * payload as `prefill`; TalkToDeepMarkChat captures it into a chip and
 * forwards it to /api/talk via per-call body. The route renders it as a
 * <selection> tag the model can reference.
 *
 * Tool dispatch:
 * - addAnnotation / updateAnnotation / removeAnnotation: resolved via the
 *   editor handle, applied as PM transactions, Yjs syncs the result.
 *   Sidebar's `onMarkApplied` is intentionally NOT fired so multi-mark
 *   batches don't flicker the active-card state.
 * - linkToScan: fires a CustomEvent SubmissionView listens to.
 * - proposeTeacherOverride: rendered as a confirm card inline in the
 *   chat. Accept fires `upsertTeacherOverride` (server action — writes
 *   to the Y.Doc; the projection mirrors it to the TeacherOverride
 *   table). Dismiss declines. Until the teacher clicks, the tool call
 *   stays pending and the model can't continue.
 */
export function ChatPanel({
	submissionId,
	gradingResults,
	onSwitchToScan,
	prefill,
	onPrefillConsumed,
}: {
	submissionId: string
	studentName: string | null
	gradingResults: GradingResult[]
	onSwitchToScan: () => void
	prefill?: {
		text: string
		questionNumber: string | null
		questionId?: string | null
	} | null
	onPrefillConsumed?: () => void
}) {
	const getEditor = useEditorHandle()
	const linkToScan = useLinkToScan()
	const { isLoading: autoResumeLoading, conversation: resumed } =
		useEditorAutoResume(submissionId)

	const onAddAnnotation = useCallback(
		async (input: AddAnnotationInput): Promise<ToolDispatchResult> => {
			const editor = getEditor()
			if (!editor) return { ok: false, reason: "Editor not mounted." }
			return applyAnnotationByPhrase(editor, input)
		},
		[getEditor],
	)

	const onUpdateAnnotation = useCallback(
		async (input: UpdateAnnotationInput): Promise<ToolDispatchResult> => {
			const editor = getEditor()
			if (!editor) return { ok: false, reason: "Editor not mounted." }
			const r = updateAnnotationById(editor, input)
			return r.ok ? { ok: true } : { ok: false, reason: r.reason }
		},
		[getEditor],
	)

	const onRemoveAnnotation = useCallback(
		async (input: RemoveAnnotationInput): Promise<ToolDispatchResult> => {
			const editor = getEditor()
			if (!editor) return { ok: false, reason: "Editor not mounted." }
			const r = removeAnnotationById(editor, input.annotationId)
			return r.ok ? { ok: true } : { ok: false, reason: r.reason }
		},
		[getEditor],
	)

	const onLinkToScan = useCallback(
		(input: {
			questionId: string
			tokenStart?: string
			tokenEnd?: string
		}) => {
			linkToScan(input)
		},
		[linkToScan],
	)

	const onProposeOverride = useCallback(
		async (
			input: ProposeTeacherOverrideInput,
		): Promise<{ ok: true } | { ok: false; reason: string }> => {
			const result = await upsertTeacherOverride({
				submissionId,
				questionId: input.questionId,
				input: {
					score_override: input.suggestedScore,
					reason: input.reason,
				},
			})
			if (result?.serverError) {
				return { ok: false, reason: result.serverError }
			}
			if (result?.validationErrors) {
				return { ok: false, reason: "Validation failed on the server." }
			}
			if (!result?.data) {
				return { ok: false, reason: "No response from the override action." }
			}
			return { ok: true }
		},
		[submissionId],
	)

	// Per-question context for the confirm card — drives the
	// "current/max → suggested/max" delta. Cheap; rebuild on each render
	// if grading_results changes.
	const overrideContextByQuestion = useMemo(() => {
		const map = new Map<string, OverrideContextEntry>()
		for (const r of gradingResults) {
			map.set(r.question_id, {
				questionNumber: r.question_number,
				currentScore: r.awarded_score,
				maxScore: r.max_score,
			})
		}
		return map
	}, [gradingResults])

	return (
		<TooltipProvider>
			<div className="flex flex-col h-full bg-card">
				<div className="shrink-0 flex items-center gap-1 border-b bg-background px-3 h-9">
					<Tooltip>
						<TooltipTrigger
							render={
								<Button
									type="button"
									variant="ghost"
									size="icon"
									onClick={onSwitchToScan}
									aria-label="Switch to scan view"
									className="h-6 w-6 text-muted-foreground hover:text-foreground"
								>
									<FileText className="h-3.5 w-3.5" aria-hidden />
								</Button>
							}
						/>
						<TooltipContent side="bottom" sideOffset={6}>
							Show scan
						</TooltipContent>
					</Tooltip>

					<div className="h-3.5 w-px bg-border mx-1" />

					<span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
						<Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden />
						DeepMark
					</span>
				</div>

				<div className="flex-1 min-h-0 overflow-hidden px-3 py-3">
					{autoResumeLoading ? null : (
						<TalkToDeepMarkChat
							// Keying on resumed id ensures a fresh useChat instance
							// when the auto-resume resolves to a previously-persisted
							// conversation — initialMessages is only read on first
							// mount.
							key={resumed?.id ?? "new"}
							submissionId={submissionId}
							conversationId={resumed?.id ?? null}
							initialMessages={
								resumed ? (resumed.messages as TalkUIMessage[]) : undefined
							}
							prefill={prefill}
							onPrefillConsumed={onPrefillConsumed}
							compact
							onAddAnnotation={onAddAnnotation}
							onUpdateAnnotation={onUpdateAnnotation}
							onRemoveAnnotation={onRemoveAnnotation}
							onLinkToScan={onLinkToScan}
							onProposeOverride={onProposeOverride}
							overrideContextByQuestion={overrideContextByQuestion}
						/>
					)}
				</div>
			</div>
		</TooltipProvider>
	)
}
