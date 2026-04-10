"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { updateStudentName } from "@/lib/marking/mutations"
import { Check, Pencil, X } from "lucide-react"
import { useState } from "react"

export function StudentNameEditor({
	jobId,
	initialName,
}: {
	jobId: string
	initialName: string | null
}) {
	const [editing, setEditing] = useState(false)
	const [name, setName] = useState(initialName ?? "")
	const [saving, setSaving] = useState(false)

	async function save() {
		setSaving(true)
		await updateStudentName(jobId, name)
		setSaving(false)
		setEditing(false)
	}

	if (!editing) {
		return (
			<div className="flex items-center gap-2">
				<span className="text-sm font-semibold">
					{name || (
						<span className="text-muted-foreground font-normal italic">
							Unknown student
						</span>
					)}
				</span>
				<Button
					variant="ghost"
					size="icon-xs"
					onClick={() => setEditing(true)}
					className="text-muted-foreground hover:text-foreground"
					aria-label="Edit student name"
				>
					<Pencil className="h-3 w-3" />
				</Button>
			</div>
		)
	}

	return (
		<div className="flex items-center gap-2">
			<Input
				value={name}
				onChange={(e) => setName(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter") void save()
					if (e.key === "Escape") setEditing(false)
				}}
				className="h-7 w-40 text-sm"
				placeholder="Student name"
				autoFocus
			/>
			<Button
				size="sm"
				variant="ghost"
				disabled={saving}
				onClick={() => void save()}
				aria-label="Save"
				className="h-7 w-7 p-0"
			>
				<Check className="h-3.5 w-3.5" />
			</Button>
			<Button
				size="sm"
				variant="ghost"
				onClick={() => setEditing(false)}
				aria-label="Cancel"
				className="h-7 w-7 p-0"
			>
				<X className="h-3.5 w-3.5" />
			</Button>
		</div>
	)
}
