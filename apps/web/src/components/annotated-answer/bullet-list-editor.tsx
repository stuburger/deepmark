"use client"

import { Textarea } from "@/components/ui/textarea"
import { useEffect, useState } from "react"

/**
 * Newline-separated textarea for editing a bullet list. Saves on blur if
 * the parsed list differs from `items`. Empty lines are stripped — items
 * with `length === 0` is the natural "no bullets" state.
 *
 * Mirrors `FeedbackOverrideEditor`'s contract — the parent passes the
 * current list in, gets the new list back via `onSave`. No "AI vs
 * teacher" distinction: edits land directly on the doc's
 * `whatWentWell` / `evenBetterIf` attrs and become the source of truth.
 */
export function BulletListEditor({
	label,
	items,
	placeholder,
	onSave,
}: {
	label: string
	items: string[]
	placeholder: string
	onSave: (next: string[]) => void
}) {
	const [text, setText] = useState(items.join("\n"))

	useEffect(() => {
		setText(items.join("\n"))
	}, [items])

	function handleBlur() {
		const next = text
			.split("\n")
			.map((s) => s.trim())
			.filter((s) => s.length > 0)
		if (next.join("\n") !== items.join("\n")) onSave(next)
	}

	return (
		<div className="space-y-1">
			<p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
				{label}
			</p>
			<Textarea
				value={text}
				onChange={(e) => setText(e.target.value)}
				onBlur={handleBlur}
				className="text-xs min-h-16 resize-y"
				placeholder={placeholder}
			/>
		</div>
	)
}
