import { Button } from "@/components/ui/button"
import type { ScriptsWorkflowState } from "@/lib/batch/types"
import { Loader2 } from "lucide-react"

export function BatchStatusBanner({
	workflow,
	onReviewClick,
}: {
	workflow: ScriptsWorkflowState
	onReviewClick: () => void
}) {
	if (workflow.isProcessing) {
		return (
			<div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3">
				<Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
				<p className="text-sm text-muted-foreground">
					Analysing upload… scripts will appear shortly.
				</p>
			</div>
		)
	}

	if (workflow.isReadyForReview) {
		const pendingCount = workflow.allScripts.filter(
			(s) => s.status !== "confirmed",
		).length
		const totalCount = workflow.allScripts.length

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

	if (workflow.isMarking) {
		const { completed, total, percent } = workflow.markingProgress
		const unsubmittedCount = workflow.unsubmittedScripts.length

		return (
			<div className="rounded-lg border bg-muted/20 px-4 py-3 space-y-2">
				<div className="flex items-center justify-between gap-4">
					<div className="flex items-center gap-3">
						<Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
						<p className="text-sm font-medium">
							Marking · {completed} of {total} scripts done
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
