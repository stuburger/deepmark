"use client"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { updateExtractedAnswer } from "@/lib/mark-actions"
import { Loader2, Pencil } from "lucide-react"
import { useState } from "react"

export function AnswerEditor({
	jobId,
	questionNumber,
	initialText,
	onSaved,
}: {
	jobId: string
	questionNumber: string
	initialText: string
	onSaved: (newText: string) => void
}) {
	const [editing, setEditing] = useState(false)
	const [text, setText] = useState(initialText)
	const [saving, setSaving] = useState(false)
	const [error, setError] = useState<string | null>(null)

	async function save() {
		setSaving(true)
		setError(null)
		const result = await updateExtractedAnswer(jobId, questionNumber, text)
		setSaving(false)
		if (!result.ok) {
			setError(result.error)
			return
		}
		onSaved(text)
		setEditing(false)
	}

	function cancel() {
		setText(initialText)
		setEditing(false)
		setError(null)
	}

	if (!editing) {
		return (
			<div className="group relative">
				<p className="font-handwriting text-base whitespace-pre-wrap rounded-md bg-muted px-3 py-2 pr-8">
					{text || (
						<span className="italic text-muted-foreground">
							No answer written
						</span>
					)}
				</p>
				<button
					type="button"
					onClick={() => setEditing(true)}
					className="absolute top-1.5 right-1.5 rounded p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-background transition-all"
					aria-label="Edit answer"
				>
					<Pencil className="h-3 w-3" />
				</button>
			</div>
		)
	}

	return (
		<div className="space-y-2">
			<Textarea
				value={text}
				onChange={(e) => setText(e.target.value)}
				className="font-handwriting text-base min-h-20 resize-y"
				autoFocus
			/>
			{error && <p className="text-xs text-destructive">{error}</p>}
			<div className="flex items-center gap-2">
				<Button size="sm" disabled={saving} onClick={() => void save()}>
					{saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
					Save
				</Button>
				<Button size="sm" variant="ghost" onClick={cancel}>
					Cancel
				</Button>
				<p className="text-xs text-muted-foreground ml-1">
					Re-mark to update the score
				</p>
			</div>
		</div>
	)
}
