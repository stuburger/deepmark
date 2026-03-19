"use client"

import { updateExamPaperTitle } from "@/lib/dashboard-actions"
import { useRouter } from "next/navigation"
import { useRef, useState } from "react"

export function EditableTitle({
	id,
	initialTitle,
}: {
	id: string
	initialTitle: string
}) {
	const [editing, setEditing] = useState(false)
	const [title, setTitle] = useState(initialTitle)
	const [pending, setPending] = useState(false)
	const inputRef = useRef<HTMLInputElement>(null)
	const router = useRouter()

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
			router.refresh()
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
				className="text-2xl font-semibold bg-transparent border-b border-foreground/30 focus:border-foreground outline-none w-full max-w-xl"
				autoFocus
			/>
		)
	}

	return (
		<h1
			className="text-2xl font-semibold cursor-pointer hover:text-foreground/70 transition-colors"
			onClick={handleClick}
			title="Click to edit title"
		>
			{title}
		</h1>
	)
}
