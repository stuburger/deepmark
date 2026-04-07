"use client"

import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { deleteSubmission } from "@/lib/marking/mutations"
import type { SubmissionHistoryItem } from "@/lib/marking/types"
import { useState } from "react"
import { toast } from "sonner"
import { ScriptCard } from "./script-card"

export function SubmissionGrid({
	submissions,
	onView,
	onDelete,
}: {
	submissions: SubmissionHistoryItem[]
	onView: (id: string) => void
	onDelete: (id: string) => void
}) {
	const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
	const [deleting, setDeleting] = useState(false)

	async function handleConfirmDelete() {
		if (!pendingDeleteId) return
		setDeleting(true)
		const result = await deleteSubmission(pendingDeleteId)
		setDeleting(false)
		if (!result.ok) {
			toast.error(result.error)
			return
		}
		onDelete(pendingDeleteId)
		setPendingDeleteId(null)
	}

	const pendingDeleteName =
		submissions.find((s) => s.id === pendingDeleteId)?.student_name ??
		"Unnamed student"

	return (
		<div className="space-y-4">
			<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
				{submissions.map((sub) => (
					<ScriptCard
						key={sub.id}
						sub={sub}
						onView={() => onView(sub.id)}
						onDeleteRequest={() => setPendingDeleteId(sub.id)}
					/>
				))}
			</div>

			<ConfirmDialog
				open={pendingDeleteId !== null}
				onOpenChange={(open) => {
					if (!deleting && !open) setPendingDeleteId(null)
				}}
				title="Delete this submission?"
				description={`This will permanently delete ${pendingDeleteName}'s submission and all its marking data. This cannot be undone.`}
				confirmLabel={deleting ? "Deleting…" : "Delete submission"}
				loading={deleting}
				onConfirm={handleConfirmDelete}
			/>
		</div>
	)
}
