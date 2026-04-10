import { Button } from "@/components/ui/button"
import type { BatchIngestionState } from "@/lib/batch/types"
import { Loader2 } from "lucide-react"

export function BatchStatusBanner({
	ingestion,
	onReviewClick,
}: {
	ingestion: BatchIngestionState
	onReviewClick: () => void
}) {
	if (ingestion.isProcessing) {
		return (
			<div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3">
				<Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
				<p className="text-sm text-muted-foreground">
					Analysing upload… scripts will appear shortly.
				</p>
			</div>
		)
	}

	// Staging or marking phase with unsubmitted scripts to review
	const unsubmittedCount = ingestion.unsubmittedScripts.length
	if (unsubmittedCount === 0) return null

	const totalCount = ingestion.allScripts.length
	const pendingReviewCount = ingestion.unsubmittedScripts.filter(
		(s) => s.status !== "confirmed",
	).length

	return (
		<div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/20 px-4 py-3">
			<div className="flex items-center gap-3">
				<span className="h-2 w-2 rounded-full bg-primary animate-pulse shrink-0" />
				<p className="text-sm">
					<span className="font-medium">
						{pendingReviewCount > 0
							? `${pendingReviewCount} of ${totalCount} script${totalCount !== 1 ? "s" : ""} need review`
							: `${unsubmittedCount} script${unsubmittedCount !== 1 ? "s" : ""} ready to mark`}
					</span>
					<span className="text-muted-foreground">
						{pendingReviewCount > 0
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
