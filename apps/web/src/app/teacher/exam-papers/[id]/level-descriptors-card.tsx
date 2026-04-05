"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { updateLevelDescriptors } from "@/lib/exam-paper/mutations"
import { queryKeys } from "@/lib/query-keys"
import { useQueryClient } from "@tanstack/react-query"
import { ChevronDown, Save } from "lucide-react"
import { useRef, useState } from "react"
import { toast } from "sonner"

export function LevelDescriptorsCard({
	examPaperId,
	initialValue,
}: {
	examPaperId: string
	initialValue: string | null
}) {
	const [open, setOpen] = useState(false)
	const [value, setValue] = useState(initialValue ?? "")
	const [saving, setSaving] = useState(false)
	const savedRef = useRef(initialValue ?? "")
	const queryClient = useQueryClient()

	const isDirty = value !== savedRef.current

	async function handleSave() {
		setSaving(true)
		const result = await updateLevelDescriptors(examPaperId, value)
		setSaving(false)
		if (!result.ok) {
			toast.error(result.error)
			return
		}
		savedRef.current = value.trim()
		setValue(value.trim())
		toast.success("Level descriptors saved")
		void queryClient.invalidateQueries({
			queryKey: queryKeys.examPaper(examPaperId),
		})
	}

	const hasContent = (initialValue ?? "").length > 0

	return (
		<Card>
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				className="flex w-full items-center justify-between px-5 py-3 text-left"
			>
				<div className="flex items-center gap-2">
					<span className="text-sm font-medium">Level Descriptors</span>
					{hasContent && (
						<span className="inline-flex items-center rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
							Set
						</span>
					)}
				</div>
				<ChevronDown
					className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
				/>
			</button>

			{open && (
				<CardContent className="pt-0 pb-4 space-y-3">
					<p className="text-xs text-muted-foreground leading-relaxed">
						Paste your exam board&apos;s level descriptors here. These guide
						marking for all level-of-response questions on this paper.
					</p>
					<Textarea
						value={value}
						onChange={(e) => setValue(e.target.value)}
						placeholder="e.g. Level 1 (1-3 marks): Simple statements, generic points..."
						rows={8}
						className="text-xs font-mono"
					/>
					<div className="flex justify-end">
						<Button
							size="sm"
							onClick={handleSave}
							disabled={!isDirty || saving}
						>
							<Save className="h-3.5 w-3.5 mr-1.5" />
							{saving ? "Saving..." : "Save"}
						</Button>
					</div>
				</CardContent>
			)}
		</Card>
	)
}
