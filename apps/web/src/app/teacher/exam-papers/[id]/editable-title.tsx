"use client"

import { updateExamPaperTitle } from "@/lib/exam-paper/paper/mutations"
import { queryKeys } from "@/lib/query-keys"
import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

export function EditableTitle({
	id,
	initialTitle,
}: {
	id: string
	initialTitle: string
}) {
	const queryClient = useQueryClient()
	const [editing, setEditing] = useState(false)
	const [draft, setDraft] = useState("")
	const [pending, setPending] = useState(false)

	function startEditing() {
		setDraft(initialTitle)
		setEditing(true)
	}

	async function handleBlur() {
		if (pending) return
		const trimmed = draft.trim()
		if (!trimmed || trimmed === initialTitle) {
			setEditing(false)
			return
		}
		setPending(true)
		const result = await updateExamPaperTitle({ id, title: trimmed })
		setPending(false)
		setEditing(false)
		if (!result?.serverError) {
			void queryClient.invalidateQueries({ queryKey: queryKeys.examPaper(id) })
		}
	}

	function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
		if (e.key === "Enter") {
			e.currentTarget.blur()
		}
		if (e.key === "Escape") {
			setEditing(false)
		}
	}

	if (editing) {
		return (
			<input
				value={draft}
				onChange={(e) => setDraft(e.target.value)}
				onBlur={handleBlur}
				onKeyDown={handleKeyDown}
				disabled={pending}
				className="text-2xl font-semibold bg-transparent border-b border-foreground/30 focus:border-foreground outline-none w-full"
			/>
		)
	}

	return (
		<button
			type="button"
			className="text-2xl font-semibold cursor-pointer hover:text-foreground/70 transition-colors truncate min-w-0 bg-transparent border-none p-0 text-left"
			onClick={startEditing}
			title={initialTitle}
		>
			{initialTitle}
		</button>
	)
}
