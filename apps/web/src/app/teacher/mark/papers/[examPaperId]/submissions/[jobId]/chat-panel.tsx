"use client"

import { useEditorHandle } from "@/components/annotated-answer/editor-handle-context"
import {
	applyAnnotationByPhrase,
	applyAnnotationByTokenRange,
	removeAnnotationById,
	updateAnnotationById,
} from "@/components/annotated-answer/talk-tool-helpers"
import { TalkToDeepMarkChat } from "@/components/talk/talk-to-deepmark-chat"
import type { ToolDispatchResult } from "@/components/talk/talk-to-deepmark-chat"
import { Button } from "@/components/ui/button"
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import type {
	AddAnnotationInput,
	RemoveAnnotationInput,
	UpdateAnnotationInput,
} from "@/lib/talk/tools"
import { FileText, Sparkles } from "lucide-react"
import { useCallback } from "react"

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
 * Tool dispatch: when DeepMark calls addAnnotation / updateAnnotation /
 * removeAnnotation / linkToScan, the callback resolves the editor from
 * the handle context and runs the corresponding PM transaction. The
 * sidebar's `onMarkApplied` is intentionally NOT fired here — DeepMark-
 * applied marks stay silent so batches don't flicker active-card state.
 */
export function ChatPanel({
	submissionId,
	onSwitchToScan,
	prefill,
	onPrefillConsumed,
}: {
	submissionId: string
	studentName: string | null
	onSwitchToScan: () => void
	prefill?: {
		text: string
		questionNumber: string | null
		questionId?: string | null
		tokenStart?: string | null
		tokenEnd?: string | null
	} | null
	onPrefillConsumed?: () => void
}) {
	const getEditor = useEditorHandle()

	const onAddAnnotation = useCallback(
		async (input: AddAnnotationInput): Promise<ToolDispatchResult> => {
			const editor = getEditor()
			if (!editor) {
				return { ok: false, reason: "Editor not mounted." }
			}
			// Phrase path — preferred, doesn't need alignment data.
			if (input.phrase) {
				return applyAnnotationByPhrase(editor, {
					...input,
					phrase: input.phrase,
				})
			}
			// Token path — requires alignment data, which is loaded inside
			// grading-results-panel.tsx and isn't yet plumbed up to ChatPanel.
			// Reject with a clear reason so the model retries with `phrase`.
			if (input.tokenStart && input.tokenEnd) {
				return {
					ok: false,
					reason:
						"Token-range annotation isn't available in this surface yet. Use the `phrase` parameter — quote the text verbatim from the Student answer block.",
				}
			}
			return {
				ok: false,
				reason: "Provide either `phrase` or both `tokenStart`+`tokenEnd`.",
			}
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
			// Emit a CustomEvent the scan panel listens to. UI navigation only;
			// no data is modified. Listener wired in submission-view.tsx.
			window.dispatchEvent(
				new CustomEvent("deepmark:link-to-scan", { detail: input }),
			)
		},
		[],
	)

	// Mark `applyAnnotationByTokenRange` referenced so dead-code analysis
	// keeps it imported — it's wired in a follow-up that lifts the
	// alignment data up to ChatPanel.
	void applyAnnotationByTokenRange

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
					<TalkToDeepMarkChat
						submissionId={submissionId}
						prefill={prefill}
						onPrefillConsumed={onPrefillConsumed}
						compact
						onAddAnnotation={onAddAnnotation}
						onUpdateAnnotation={onUpdateAnnotation}
						onRemoveAnnotation={onRemoveAnnotation}
						onLinkToScan={onLinkToScan}
					/>
				</div>
			</div>
		</TooltipProvider>
	)
}
