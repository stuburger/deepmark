"use client"

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { QuestionEditForm } from "./question-edit-form"

export function QuestionEditDialog({
	questionId,
	initialText,
	initialPoints,
	initialQuestionNumber,
	paperId,
	open,
	onOpenChange,
	onSaved,
}: {
	questionId: string
	initialText: string
	initialPoints: number | null
	initialQuestionNumber: string | null
	paperId?: string
	open: boolean
	onOpenChange: (open: boolean) => void
	onSaved?: () => void
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Edit question</DialogTitle>
					<DialogDescription>
						Update the question text, number, or marks.
					</DialogDescription>
				</DialogHeader>
				<QuestionEditForm
					questionId={questionId}
					initialText={initialText}
					initialPoints={initialPoints}
					initialQuestionNumber={initialQuestionNumber}
					paperId={paperId}
					onSaved={onSaved}
				/>
			</DialogContent>
		</Dialog>
	)
}
