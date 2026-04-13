"use client"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { RotateCcw } from "lucide-react"
import { useEffect, useState } from "react"

export function FeedbackOverrideEditor({
	aiFeedback,
	overrideFeedback,
	isEditing,
	onSave,
	onReset,
}: {
	aiFeedback: string | null
	overrideFeedback: string | null
	isEditing: boolean
	onSave: (text: string) => void
	onReset: () => void
}) {
	const effectiveFeedback = overrideFeedback ?? aiFeedback
	const isOverridden = overrideFeedback !== null
	const [text, setText] = useState(effectiveFeedback ?? "")

	// Sync when override changes externally
	useEffect(() => {
		setText(overrideFeedback ?? aiFeedback ?? "")
	}, [overrideFeedback, aiFeedback])

	function handleBlur() {
		const trimmed = text.trim()
		if (trimmed !== (effectiveFeedback ?? "")) {
			onSave(trimmed)
		}
	}

	if (!effectiveFeedback && !isEditing) return null

	if (isEditing) {
		return (
			<div className="space-y-1">
				<div className="flex items-center gap-1.5">
					<p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
						Feedback
					</p>
					{isOverridden && (
						<span className="text-[9px] font-medium text-blue-500">Edited</span>
					)}
					{isOverridden && (
						<Button
							variant="ghost"
							size="icon-xs"
							onClick={onReset}
							className="text-muted-foreground hover:text-destructive ml-auto"
							title="Reset to AI feedback"
						>
							<RotateCcw className="h-2.5 w-2.5" />
						</Button>
					)}
				</div>
				<Textarea
					value={text}
					onChange={(e) => setText(e.target.value)}
					onBlur={handleBlur}
					className="text-xs min-h-16 resize-y"
					placeholder="Override feedback..."
				/>
			</div>
		)
	}

	return (
		<div className="relative">
			{isOverridden && (
				<span className="text-[9px] font-medium text-blue-500 -mt-3 block mb-0.5">
					Edited
				</span>
			)}
			<p className="text-muted-foreground leading-relaxed bg-zinc-50 dark:bg-zinc-900 rounded-md px-3 py-2">
				{effectiveFeedback}
			</p>
		</div>
	)
}
