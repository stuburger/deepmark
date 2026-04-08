"use client"

import { Button } from "@/components/ui/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import type {
	ExamPaperQuestion,
	UnlinkedMarkScheme,
} from "@/lib/exam-paper/types"
import type { UseMutateFunction } from "@tanstack/react-query"

interface LinkMarkSchemeDialogProps {
	linkingItem: UnlinkedMarkScheme | null
	setLinkingItem: (item: UnlinkedMarkScheme | null) => void
	linkingTargetId: string
	setLinkingTargetId: (id: string) => void
	linkingBusy: boolean
	doLinkMarkScheme: UseMutateFunction<
		unknown,
		Error,
		{ ghostQuestionId: string; targetQuestionId: string },
		unknown
	>
	questions: ExamPaperQuestion[]
}

export function LinkMarkSchemeDialog({
	linkingItem,
	setLinkingItem,
	linkingTargetId,
	setLinkingTargetId,
	linkingBusy,
	doLinkMarkScheme,
	questions,
}: LinkMarkSchemeDialogProps) {
	const eligibleQuestions = questions.filter(
		(q) => q.mark_scheme_status === null,
	)

	return (
		<Dialog
			open={linkingItem !== null}
			onOpenChange={(open) => {
				if (!linkingBusy) {
					setLinkingItem(open ? linkingItem : null)
				}
			}}
		>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Link mark scheme to question</DialogTitle>
					<DialogDescription>
						Choose which question in this paper should receive this mark scheme.
						Only questions without a mark scheme are shown.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-3">
					<div className="space-y-1.5 max-h-64 overflow-y-auto">
						{eligibleQuestions.map((q) => (
							<label
								key={q.id}
								className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
									linkingTargetId === q.id
										? "border-primary bg-primary/5"
										: "hover:bg-muted/50"
								}`}
							>
								<input
									type="radio"
									name="link-target"
									value={q.id}
									checked={linkingTargetId === q.id}
									onChange={() => setLinkingTargetId(q.id)}
									className="mt-0.5"
									disabled={linkingBusy}
								/>
								<div className="min-w-0">
									{q.question_number && (
										<p className="text-xs text-muted-foreground">
											Q{q.question_number}
										</p>
									)}
									<p className="text-sm line-clamp-2">{q.text}</p>
								</div>
							</label>
						))}
						{eligibleQuestions.length === 0 && (
							<p className="text-sm text-muted-foreground py-4 text-center">
								All questions already have a mark scheme.
							</p>
						)}
					</div>
					<div className="flex gap-2 justify-end">
						<Button
							variant="outline"
							disabled={linkingBusy}
							onClick={() => setLinkingItem(null)}
						>
							Cancel
						</Button>
						<Button
							disabled={!linkingTargetId || linkingBusy}
							onClick={() => {
								if (!linkingItem || !linkingTargetId) return
								doLinkMarkScheme(
									{
										ghostQuestionId: linkingItem.ghostQuestionId,
										targetQuestionId: linkingTargetId,
									},
									{
										onSuccess: () => {
											setLinkingItem(null)
											setLinkingTargetId("")
										},
									},
								)
							}}
						>
							{linkingBusy ? (
								<>
									<Spinner className="h-3.5 w-3.5 mr-1.5" />
									Linking…
								</>
							) : (
								"Link mark scheme"
							)}
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	)
}
