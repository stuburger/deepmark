"use client"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { RotateCcw } from "lucide-react"
import { useEffect, useState } from "react"

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
	const effectiveFeedback = overrideFeedback ?? aiFeedback
	const isOverridden = overrideFeedback !== null
	const [text, setText] = useState(effectiveFeedback ?? "")

	useEffect(() => {
		setText(overrideFeedback ?? aiFeedback ?? "")
	}, [overrideFeedback, aiFeedback])

	function handleBlur() {
		const trimmed = text.trim()
		if (trimmed !== (effectiveFeedback ?? "")) {
			onSave(trimmed)
		}
	}

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
				placeholder="Add or override feedback..."
			/>
		</div>
	)
}
