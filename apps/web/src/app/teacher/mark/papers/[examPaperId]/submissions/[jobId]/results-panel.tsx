"use client"

import { ScrollArea } from "@/components/ui/scroll-area"
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import type { MarkingPhase } from "@/lib/marking/stages/phase"
import type {
	PageToken,
	StudentPaperAnnotation,
	StudentPaperJobPayload,
	TeacherOverride,
} from "@/lib/marking/types"
import { cn } from "@/lib/utils"
import { MessageSquare, X } from "lucide-react"
import { useState } from "react"
import { CancelledPanel } from "./cancelled"
import { FailedPanel } from "./failed"
import { MarkingResults } from "./results/index"
/**
 * Results panel — always renders the editor (MarkingResults), regardless of
 * pipeline phase. In-progress stage status is surfaced by the StatusBadge in
 * the submission toolbar, not by replacing the editor with a spinner.
 *
 * Failed and cancelled phases show a banner *above* the editor so the
 * teacher still sees whatever partial data was captured (extracted answers,
 * partial grading) before the failure.
 */
type SharedPanelProps = {
	jobId: string
	data: StudentPaperJobPayload
	phase: MarkingPhase
	annotations: StudentPaperAnnotation[]
	pageTokens: PageToken[]
	activeQuestionNumber: string | null
	overridesByQuestionId?: Map<string, TeacherOverride>
	onDerivedAnnotations?: (annotations: StudentPaperAnnotation[]) => void
	onTokenHighlight?: (tokenIds: string[] | null) => void
	onAskDeepMark?: (input: {
		text: string
		questionNumber: string | null
	}) => void
}

export function ResultsPanel({
	jobId,
	data,
	phase,
	annotations,
	pageTokens,
	activeQuestionNumber,
	overridesByQuestionId,
	onDerivedAnnotations,
	onTokenHighlight,
	onAskDeepMark,
}: SharedPanelProps) {
	// Slot for the AnnotationToolbar pill — owned by the editor (deeper in
	// the tree where the editor instance lives) but rendered here via a
	// React Portal so it visually sits inside the identity bar. State
	// instead of a plain ref so the deeper component re-renders once the
	// slot DOM node is attached.
	const [toolbarSlot, setToolbarSlot] = useState<HTMLDivElement | null>(null)

	// AO sidebar visibility below `lg` — at lg+ it's always inline; here
	// we drive a toggle so md viewports can pull it in over the editor on
	// demand. The trigger lives in this bar's right gutter (where the
	// sidebar sits at lg+) so the controls are co-located.
	const [aoOpen, setAoOpen] = useState(false)

	return (
		<TooltipProvider>
			<div className="flex flex-col h-full">
				{/* Editor chrome bar — mirrors the ScanPanel header on the LHS
				    so the bottom borders align horizontally. The right gutter
				    mirrors the comment-sidebar column when the sidebar is
				    visible (lg+ always, or md when aoOpen). When closed at
				    md, the gutter collapses and a flush-right trigger button
				    shows instead. The annotation toolbar pill renders into
				    the centre slot via React Portal. */}
				<div className="shrink-0 flex items-stretch border-b bg-background px-3 h-9 gap-3">
					<div className="flex-1 min-w-0 flex items-center justify-center">
						<div ref={setToolbarSlot} className="w-fit max-w-full" />
					</div>
					{!aoOpen && (
						<Tooltip>
							<TooltipTrigger
								render={
									<button
										type="button"
										onClick={() => setAoOpen(true)}
										aria-label="Show annotations"
										className="self-center lg:hidden inline-flex items-center justify-center h-6 w-6 rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
									>
										<MessageSquare className="h-3.5 w-3.5" />
									</button>
								}
							/>
							<TooltipContent side="bottom" sideOffset={6}>
								Show annotations
							</TooltipContent>
						</Tooltip>
					)}
					<div
						className={cn(
							"shrink-0 w-52 items-center justify-end",
							aoOpen ? "flex" : "hidden lg:flex",
						)}
					>
						{aoOpen && (
							<Tooltip>
								<TooltipTrigger
									render={
										<button
											type="button"
											onClick={() => setAoOpen(false)}
											aria-label="Hide annotations"
											className="lg:hidden inline-flex items-center justify-center h-6 w-6 rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
										>
											<X className="h-3.5 w-3.5" />
										</button>
									}
								/>
								<TooltipContent side="bottom" sideOffset={6}>
									Hide annotations
								</TooltipContent>
							</Tooltip>
						)}
					</div>
				</div>

				<ScrollArea data-results-panel className="flex-1 min-h-0 w-full">
					<div className="px-3 pt-2 pb-4 space-y-4 w-full">
						{phase === "failed" && <FailedPanel data={data} jobId={jobId} />}
						{phase === "cancelled" && <CancelledPanel />}

						<MarkingResults
							jobId={jobId}
							data={data}
							annotations={annotations}
							pageTokens={pageTokens}
							activeQuestionNumber={activeQuestionNumber}
							overridesByQuestionId={overridesByQuestionId}
							onDerivedAnnotations={onDerivedAnnotations}
							onTokenHighlight={onTokenHighlight}
							onAskDeepMark={onAskDeepMark}
							toolbarSlot={toolbarSlot}
							aoOpen={aoOpen}
						/>
					</div>
				</ScrollArea>
			</div>
		</TooltipProvider>
	)
}
