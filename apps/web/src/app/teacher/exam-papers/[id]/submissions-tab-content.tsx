import type { BatchIngestionState } from "@/lib/batch/types"
import type { SubmissionHistoryItem } from "@/lib/marking/types"
import { useState } from "react"
import { BatchStatusBanner } from "./batch-status-banner"
import { SubmissionTable } from "./submission-table"
import { SubmissionsHeader } from "./submissions-header"

export function SubmissionsTabContent({
	paperId,
	ingestion,
	submissions,
	markedCount,
	inProgressCount,
	onOpenStaging,
	onViewJob,
	onDeleteSubmission,
	onRefresh,
	isRefreshing,
}: {
	paperId: string
	ingestion: BatchIngestionState | null
	submissions: SubmissionHistoryItem[]
	markedCount: number
	inProgressCount: number
	onOpenStaging: () => void
	onViewJob: (id: string) => void
	onDeleteSubmission: (id: string) => void
	onRefresh: () => void
	isRefreshing: boolean
}) {
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

	return (
		<>
			{ingestion && (
				<BatchStatusBanner
					ingestion={ingestion}
					onReviewClick={onOpenStaging}
				/>
			)}

			{submissions.length > 0 && (
				<>
					<SubmissionsHeader
						paperId={paperId}
						submissions={submissions}
						selectedIds={selectedIds}
						markedCount={markedCount}
						inProgressCount={inProgressCount}
						onRefresh={onRefresh}
						isRefreshing={isRefreshing}
					/>
					<SubmissionTable
						submissions={submissions}
						onView={onViewJob}
						onDeleteRequest={onDeleteSubmission}
						selectedIds={selectedIds}
						onSelectionChange={setSelectedIds}
					/>
				</>
			)}

			{!ingestion && submissions.length === 0 && (
				<div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
					No submissions yet. Click &ldquo;Upload scripts&rdquo; to mark your
					first student script.
				</div>
			)}
		</>
	)
}
