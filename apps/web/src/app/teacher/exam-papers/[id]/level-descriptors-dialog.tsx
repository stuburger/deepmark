"use client"

import { Button } from "@/components/ui/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { updateLevelDescriptors } from "@/lib/exam-paper/paper/mutations"
import { queryKeys } from "@/lib/query-keys"
import { useQueryClient } from "@tanstack/react-query"
import { Save } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

type Props = {
	open: boolean
	onOpenChange: (open: boolean) => void
	examPaperId: string
	initialValue: string | null
	onSaved: (value: string) => void
}

export function LevelDescriptorsDialog({
	open,
	onOpenChange,
	examPaperId,
	initialValue,
	onSaved,
}: Props) {
	const [value, setValue] = useState(initialValue ?? "")
	const [saving, setSaving] = useState(false)
	const queryClient = useQueryClient()

	const savedValue = initialValue ?? ""
	const isDirty = value !== savedValue

	async function handleSave() {
		setSaving(true)
		const result = await updateLevelDescriptors({
			examPaperId,
			levelDescriptors: value,
		})
		setSaving(false)
		if (result?.serverError) {
			toast.error(result.serverError)
			return
		}
		const trimmed = value.trim()
		setValue(trimmed)
		onSaved(trimmed)
		toast.success("Marking guidance saved")
		void queryClient.invalidateQueries({
			queryKey: queryKeys.examPaper(examPaperId),
		})
		onOpenChange(false)
	}

	function handleOpenChange(nextOpen: boolean) {
		if (!nextOpen) {
			setValue(initialValue ?? "")
		}
		onOpenChange(nextOpen)
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Marking Guidance</DialogTitle>
					<DialogDescription>
						Provide guidance for marking level-of-response questions on this
						paper. Paste your exam board&apos;s level descriptors, describe how
						feedback should be phrased, or include few-shot examples in your own
						voice.
					</DialogDescription>
				</DialogHeader>
				<Textarea
					value={value}
					onChange={(e) => setValue(e.target.value)}
					placeholder="e.g. Level 1 (1–3 marks): Simple statements with no development…&#10;&#10;Feedback style: phrase EBI as 'Next time, try to…' and keep WWW to 2 specific points."
					rows={18}
					className="text-xs font-mono resize-none"
				/>
				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => handleOpenChange(false)}
						disabled={saving}
					>
						Cancel
					</Button>
					<Button onClick={handleSave} disabled={!isDirty || saving}>
						<Save className="h-3.5 w-3.5 mr-1.5" />
						{saving ? "Saving…" : "Save"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
