import { Button } from "@/components/ui/button"
import type { ActiveBatchInfo } from "@/lib/batch/types"
import { Loader2 } from "lucide-react"

export function BatchStatusBanner({
	activeBatch,
	onReviewClick,
}: {
	activeBatch: NonNullable<ActiveBatchInfo>
	onReviewClick: () => void
}) {
	if (activeBatch.status === "classifying") {
		return (
			<div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3">
				<Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
				<p className="text-sm text-muted-foreground">
					Analysing upload… scripts will appear shortly.
				</p>
			</div>
		)
	}

	if (activeBatch.status === "staging") {
		const pendingCount = activeBatch.staged_scripts.filter(
			(s) => s.status !== "confirmed",
		).length
		const totalCount = activeBatch.staged_scripts.length

		return (
			<div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/20 px-4 py-3">
				<div className="flex items-center gap-3">
					<span className="h-2 w-2 rounded-full bg-primary animate-pulse shrink-0" />
					<p className="text-sm">
						<span className="font-medium">
							{pendingCount > 0
								? `${pendingCount} of ${totalCount} script${totalCount !== 1 ? "s" : ""} need review`
								: `${totalCount} script${totalCount !== 1 ? "s" : ""} ready to mark`}
						</span>
						<span className="text-muted-foreground">
							{pendingCount > 0
								? " — confirm before submitting for marking"
								: " — open the review panel to start marking"}
						</span>
					</p>
				</div>
				<Button size="sm" onClick={onReviewClick}>
					Review scripts
				</Button>
			</div>
		)
	}

	if (activeBatch.status === "marking") {
		const completedCount = activeBatch.student_jobs.filter(
			(j) => j.status === "ocr_complete",
		).length
		const total = activeBatch.total_student_jobs
		const percent = total > 0 ? Math.round((completedCount / total) * 100) : 0

		const unsubmittedCount = activeBatch.staged_scripts.filter((s) => {
			const submittedIds = new Set(
				activeBatch.student_jobs.map((j) => j.staged_script_id),
			)
			return !submittedIds.has(s.id)
		}).length

		return (
			<div className="rounded-lg border bg-muted/20 px-4 py-3 space-y-2">
				<div className="flex items-center justify-between gap-4">
					<div className="flex items-center gap-3">
						<Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
						<p className="text-sm font-medium">
							Marking · {completedCount} of {total} scripts done
						</p>
					</div>
					<div className="flex items-center gap-3">
						<span className="text-sm text-muted-foreground tabular-nums">
							{percent}%
						</span>
						{unsubmittedCount > 0 && (
							<Button size="sm" variant="outline" onClick={onReviewClick}>
								{unsubmittedCount} more to review
							</Button>
						)}
					</div>
				</div>
				<div className="h-1.5 rounded-full bg-muted overflow-hidden">
					<div
						className="h-full rounded-full bg-primary transition-all duration-500"
						style={{ width: `${percent}%` }}
					/>
				</div>
			</div>
		)
	}

	return null
}
