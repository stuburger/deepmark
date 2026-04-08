"use client"

import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { deleteQuestion } from "@/lib/exam-paper/questions/mutations"
import { Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

export function DeleteQuestionButton({
	questionId,
	examPaperId,
}: {
	questionId: string
	examPaperId: string
}) {
	const router = useRouter()
	const [open, setOpen] = useState(false)
	const [deleting, setDeleting] = useState(false)
	const [error, setError] = useState<string | null>(null)

	async function handleConfirm() {
		setDeleting(true)
		setError(null)
		const result = await deleteQuestion(questionId)
		setDeleting(false)
		if (!result.ok) {
			setError(result.error)
			return
		}
		router.push(`/teacher/exam-papers/${examPaperId}`)
		router.refresh()
	}

	return (
		<>
			<Button
				size="sm"
				variant="ghost"
				className="text-muted-foreground hover:text-destructive"
				onClick={() => setOpen(true)}
			>
				<Trash2 className="h-3.5 w-3.5" />
				<span className="sr-only">Delete question</span>
			</Button>

			<ConfirmDialog
				open={open}
				onOpenChange={(next) => {
					if (!deleting) setOpen(next)
				}}
				title="Delete this question?"
				description="This will permanently remove the question, its mark scheme, and all associated data. This cannot be undone."
				confirmLabel={deleting ? "Deleting…" : "Delete question"}
				loading={deleting}
				onConfirm={handleConfirm}
			/>

			{error && <p className="text-sm text-destructive mt-2">{error}</p>}
		</>
	)
}
