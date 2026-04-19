import type { BatchIngestionState } from "@/lib/batch/types"
import type { SubmissionHistoryItem } from "@/lib/marking/types"
import { BatchStatusBanner } from "./batch-status-banner"
import { SubmissionList } from "./submission-list"
import { SubmissionTable } from "./submission-table"
import { SubmissionsHeader } from "./submissions-header"

export function SubmissionsTabContent({
	ingestion,
	submissions,
	markedCount,
	inProgressCount,
	view,
	onViewChange,
	onOpenStaging,
	onViewJob,
	onDeleteSubmission,
	onRefresh,
	isRefreshing,
}: {
	ingestion: BatchIngestionState | null
	submissions: SubmissionHistoryItem[]
	markedCount: number
	inProgressCount: number
	view: "list" | "table"
	onViewChange: (v: "list" | "table") => void
	onOpenStaging: () => void
	onViewJob: (id: string) => void
	onDeleteSubmission: (id: string) => void
	onRefresh: () => void
	isRefreshing: boolean
}) {
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
						markedCount={markedCount}
						inProgressCount={inProgressCount}
						view={view}
						onViewChange={onViewChange}
						onRefresh={onRefresh}
						isRefreshing={isRefreshing}
					/>
					{view === "list" ? (
						<SubmissionList
							submissions={submissions}
							onView={onViewJob}
							onDelete={onDeleteSubmission}
						/>
					) : (
						<SubmissionTable
							submissions={submissions}
							onView={onViewJob}
							onDeleteRequest={onDeleteSubmission}
						/>
					)}
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
