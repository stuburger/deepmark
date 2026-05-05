import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import type { SourceFileProgress } from "@/lib/batch/events"
import type { BatchIngestionState } from "@/lib/batch/types"
import {
	AlertTriangle,
	CheckCircle2,
	FileText,
	Loader2,
} from "lucide-react"

export function BatchStatusBanner({
	ingestion,
	onReviewClick,
}: {
	ingestion: BatchIngestionState
	onReviewClick: () => void
}) {
	if (ingestion.isFailed) return <FailureCard ingestion={ingestion} />
	if (ingestion.isProcessing) return <ProgressCard ingestion={ingestion} />

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
				<AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" />
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

// ─── Live progress card ────────────────────────────────────────────────────

function ProgressCard({ ingestion }: { ingestion: BatchIngestionState }) {
	const { progress } = ingestion

	// Pre-events fallback: handler hasn't emitted anything yet.
	if (progress.sourceFiles.length === 0) {
		return (
			<div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
				<Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
				<p className="text-sm text-muted-foreground">
					Analysing upload… scripts will appear shortly.
				</p>
			</div>
		)
	}

	return (
		<div className="rounded-lg border bg-card p-4 space-y-3">
			<div className="flex items-center gap-2">
				<Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
				<p className="text-sm font-medium text-foreground">Analysing upload</p>
			</div>
			<div className="space-y-3">
				{progress.sourceFiles.map((file) => (
					<SourceFileRow key={file.sourceKey} file={file} />
				))}
			</div>
		</div>
	)
}

function SourceFileRow({ file }: { file: SourceFileProgress }) {
	const fileName = file.sourceKey.split("/").pop() ?? file.sourceKey
	const { phaseLabel, phaseProcessed, phaseTotal, isDone } = phaseDescriptor(
		file,
	)
	const percent =
		phaseTotal > 0 ? Math.round((phaseProcessed / phaseTotal) * 100) : 0

	return (
		<div className="space-y-1.5 pl-1">
			<div className="flex items-center justify-between gap-3 text-sm">
				<div className="flex items-center gap-2 min-w-0">
					<FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
					<span className="font-medium truncate text-foreground">
						{fileName}
					</span>
					<span className="text-xs text-muted-foreground">
						({file.totalPages} pages)
					</span>
				</div>
				{isDone ? (
					<span className="flex items-center gap-1.5 text-xs text-success shrink-0">
						<CheckCircle2 className="h-3.5 w-3.5" />
						{file.scriptCount} script{file.scriptCount === 1 ? "" : "s"} found
					</span>
				) : (
					<span className="text-xs text-muted-foreground shrink-0">
						{phaseLabel} {phaseProcessed} / {phaseTotal}
					</span>
				)}
			</div>
			{!isDone && <Progress value={percent} className="h-1.5" />}
		</div>
	)
}

function phaseDescriptor(file: SourceFileProgress): {
	phaseLabel: string
	phaseProcessed: number
	phaseTotal: number
	isDone: boolean
} {
	switch (file.currentPhase) {
		case "extract":
			return {
				phaseLabel: "Extracting pages",
				phaseProcessed: file.pagesExtracted,
				phaseTotal: file.totalPages,
				isDone: false,
			}
		case "extract_done":
			return {
				phaseLabel: "Pages extracted",
				phaseProcessed: file.totalPages,
				phaseTotal: file.totalPages,
				isDone: false,
			}
		case "ocr":
			return {
				phaseLabel: "Reading text",
				phaseProcessed: file.pagesOcrd,
				phaseTotal: file.totalPages,
				isDone: false,
			}
		case "done":
			return {
				phaseLabel: "Done",
				phaseProcessed: file.totalPages,
				phaseTotal: file.totalPages,
				isDone: true,
			}
	}
}

// ─── Failure card ──────────────────────────────────────────────────────────

function FailureCard({ ingestion }: { ingestion: BatchIngestionState }) {
	const reason =
		ingestion.progress.failureReason ??
		"Something went wrong analysing this upload. Please try again with a smaller file."
	return (
		<div className="rounded-lg border border-destructive/40 bg-error-50 p-4 space-y-2">
			<div className="flex items-center gap-2">
				<AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
				<p className="text-sm font-medium text-destructive">Upload failed</p>
			</div>
			<p className="text-sm text-foreground/80">{reason}</p>
		</div>
	)
}
