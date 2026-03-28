"use client"

import { updateExamPaperTitle } from "@/lib/dashboard-actions"
import { queryKeys } from "@/lib/query-keys"
import { useQueryClient } from "@tanstack/react-query"
import { useRef, useState } from "react"

export function EditableTitle({
	id,
	initialTitle,
}: {
	id: string
	initialTitle: string
}) {
	const queryClient = useQueryClient()
	const [editing, setEditing] = useState(false)
	const [title, setTitle] = useState(initialTitle)
	const [pending, setPending] = useState(false)
	const inputRef = useRef<HTMLInputElement>(null)

	function handleClick() {
		setEditing(true)
		setTimeout(() => inputRef.current?.focus(), 0)
	}

	async function handleBlur() {
		if (pending) return
		const trimmed = title.trim()
		if (!trimmed) {
			setTitle(initialTitle)
			setEditing(false)
			return
		}
		if (trimmed === initialTitle) {
			setEditing(false)
			return
		}
		setPending(true)
		const result = await updateExamPaperTitle(id, trimmed)
		setPending(false)
		setEditing(false)
		if (!result.ok) {
			setTitle(initialTitle)
		} else {
			setTitle(trimmed)
			void queryClient.invalidateQueries({ queryKey: queryKeys.examPaper(id) })
		}
	}

	function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
		if (e.key === "Enter") {
			inputRef.current?.blur()
		}
		if (e.key === "Escape") {
			setTitle(initialTitle)
			setEditing(false)
		}
	}

	if (editing) {
		return (
			<input
				ref={inputRef}
				value={title}
				onChange={(e) => setTitle(e.target.value)}
				onBlur={handleBlur}
				onKeyDown={handleKeyDown}
				disabled={pending}
				className="text-2xl font-semibold bg-transparent border-b border-foreground/30 focus:border-foreground outline-none w-full"
				autoFocus
			/>
		)
	}

	return (
		<h1
			className="text-2xl font-semibold cursor-pointer hover:text-foreground/70 transition-colors truncate min-w-0"
			onClick={handleClick}
			title={title}
		>
			{title}
		</h1>
	)
}
