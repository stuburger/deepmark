"use client"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Pencil, RotateCcw } from "lucide-react"
import { useState } from "react"

export function FeedbackOverrideEditor({
	aiFeedback,
	overrideFeedback,
	onSave,
	onReset,
}: {
	aiFeedback: string | null
	overrideFeedback: string | null
	onSave: (text: string) => void
	onReset: () => void
}) {
	const [editing, setEditing] = useState(false)
	const effectiveFeedback = overrideFeedback ?? aiFeedback
	const isOverridden = overrideFeedback !== null

	function handleStartEdit() {
		setEditing(true)
	}

	if (!effectiveFeedback && !editing) return null

	if (editing) {
		return (
			<FeedbackEditForm
				initial={effectiveFeedback ?? ""}
				onSave={(text) => {
					onSave(text)
					setEditing(false)
				}}
				onCancel={() => setEditing(false)}
			/>
		)
	}

	return (
		<div className="group/feedback relative">
			<p className="text-muted-foreground leading-relaxed bg-zinc-50 dark:bg-zinc-900 rounded-md px-3 py-2 pr-8">
				{effectiveFeedback}
			</p>
			{isOverridden && (
				<span className="absolute top-1.5 left-3 text-[9px] font-medium text-blue-500 -mt-4">
					Edited
				</span>
			)}
			<div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 opacity-0 group-hover/feedback:opacity-100 transition-opacity">
				<button
					type="button"
					onClick={handleStartEdit}
					className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-background transition-all"
					title="Edit feedback"
				>
					<Pencil className="h-3 w-3" />
				</button>
				{isOverridden && (
					<button
						type="button"
						onClick={onReset}
						className="rounded p-1 text-muted-foreground hover:text-destructive transition-all"
						title="Reset to AI feedback"
					>
						<RotateCcw className="h-3 w-3" />
					</button>
				)}
			</div>
		</div>
	)
}

function FeedbackEditForm({
	initial,
	onSave,
	onCancel,
}: {
	initial: string
	onSave: (text: string) => void
	onCancel: () => void
}) {
	const [text, setText] = useState(initial)

	return (
		<div className="space-y-2">
			<Textarea
				value={text}
				onChange={(e) => setText(e.target.value)}
				className="text-sm min-h-16 resize-y"
				autoFocus
			/>
			<div className="flex items-center gap-2">
				<Button size="sm" onClick={() => onSave(text.trim())}>
					Save
				</Button>
				<Button size="sm" variant="ghost" onClick={onCancel}>
					Cancel
				</Button>
			</div>
		</div>
	)
}
