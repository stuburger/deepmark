"use client"

import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { regradeSubmissions } from "@/lib/marking/stages/mutations"
import type { SubmissionHistoryItem } from "@/lib/marking/types"
import { queryKeys } from "@/lib/query-keys"
import { useCurrentUser } from "@/lib/users/use-current-user"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { RotateCcw } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

export function RegradeButton({
	paperId,
	submissions,
	selectedIds,
}: {
	paperId: string
	submissions: SubmissionHistoryItem[]
	selectedIds: Set<string>
}) {
	const [open, setOpen] = useState(false)
	const queryClient = useQueryClient()
	const { skipsLedger } = useCurrentUser()

	const targets =
		selectedIds.size > 0
			? submissions.filter(
					(s) => selectedIds.has(s.id) && s.status === "ocr_complete",
				)
			: submissions.filter((s) => s.status === "ocr_complete")
	const count = targets.length
	const isSelectionMode = selectedIds.size > 0

	const mutation = useMutation({
		mutationFn: async () => {
			const result = await regradeSubmissions({
				examPaperId: paperId,
				submissionIds: isSelectionMode ? targets.map((t) => t.id) : undefined,
			})
			if (result?.serverError) throw new Error(result.serverError)
			return result?.data
		},
		onSuccess: (data) => {
			const n = data?.count ?? 0
			toast.success(`Regrading ${n} script${n === 1 ? "" : "s"}`)
			setOpen(false)
			queryClient.invalidateQueries({
				queryKey: queryKeys.submissions(paperId),
			})
			// Any expanded version-history rows would otherwise show stale data
			// for up to staleTime. Drop the lot — they're keyed per-submission
			// so a prefix invalidate is the simplest catch-all.
			queryClient.invalidateQueries({ queryKey: ["jobVersions"] })
		},
		onError: (err: Error) => {
			toast.error(err.message)
		},
	})

	if (count === 0) return null

	const buttonLabel = isSelectionMode ? `Regrade ${count}` : "Regrade all"
	const description = skipsLedger
		? "Each script will be graded again from scratch."
		: `Each script will be graded again from scratch. This uses ${count} credit${count === 1 ? "" : "s"}.`

	return (
		<>
			<Button
				variant="outline"
				size="sm"
				onClick={() => setOpen(true)}
				className="gap-1.5"
			>
				<RotateCcw className="h-3.5 w-3.5" />
				{buttonLabel}
			</Button>
			<ConfirmDialog
				open={open}
				onOpenChange={setOpen}
				title={`Regrade ${count} script${count === 1 ? "" : "s"}?`}
				description={description}
				confirmLabel={mutation.isPending ? "Starting…" : "Regrade"}
				destructive={false}
				loading={mutation.isPending}
				onConfirm={() => mutation.mutate()}
			/>
		</>
	)
}
