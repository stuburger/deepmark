"use client"

import { Button } from "@/components/ui/button"
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { updateExamPaperTitle } from "@/lib/exam-paper/paper/mutations"
import { queryKeys } from "@/lib/query-keys"
import { useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { toast } from "sonner"

/**
 * Rename dialog for an exam paper. Replaces the click-to-edit inline title on
 * mobile (where in-place editing was painful) and is reachable from the
 * desktop ⋯ menu too. The dialog form keeps the title input full-width and
 * gives the action proper Cancel/Save affordances.
 */
export function RenameExamPaperDialog({
	id,
	currentTitle,
	open,
	onOpenChange,
}: {
	id: string
	currentTitle: string
	open: boolean
	onOpenChange: (open: boolean) => void
}) {
	const queryClient = useQueryClient()
	const [draft, setDraft] = useState(currentTitle)
	const [pending, setPending] = useState(false)

	// Reset the draft to the current title each time the dialog opens so a
	// half-edited string from a previous open doesn't leak in.
	useEffect(() => {
		if (open) setDraft(currentTitle)
	}, [open, currentTitle])

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault()
		const trimmed = draft.trim()
		if (!trimmed || trimmed === currentTitle) {
			onOpenChange(false)
			return
		}
		setPending(true)
		const result = await updateExamPaperTitle({ id, title: trimmed })
		setPending(false)
		if (result?.serverError) {
			toast.error(result.serverError)
			return
		}
		void queryClient.invalidateQueries({ queryKey: queryKeys.examPaper(id) })
		onOpenChange(false)
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Rename paper</DialogTitle>
				</DialogHeader>
				<form onSubmit={handleSubmit} className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="rename-paper-title">Title</Label>
						<Input
							id="rename-paper-title"
							value={draft}
							onChange={(e) => setDraft(e.target.value)}
							disabled={pending}
							autoFocus
							placeholder="e.g. Macroeconomics, Paper 2"
						/>
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
							disabled={pending}
						>
							Cancel
						</Button>
						<Button
							type="submit"
							disabled={pending || draft.trim().length === 0}
						>
							{pending ? "Saving…" : "Save"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}
