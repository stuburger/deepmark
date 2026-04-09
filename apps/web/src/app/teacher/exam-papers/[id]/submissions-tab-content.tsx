import type { ScriptsWorkflowState } from "@/lib/batch/types"
import type { SubmissionHistoryItem } from "@/lib/marking/types"
import { BatchStatusBanner } from "./batch-status-banner"
import { SubmissionGrid } from "./submission-grid"
import { SubmissionTable } from "./submission-table"
import { SubmissionsHeader } from "./submissions-header"

function SubmissionSection({
	label,
	submissions,
	view,
	onViewChange,
	onView,
	onDelete,
}: {
	label: string
	submissions: SubmissionHistoryItem[]
	view: "grid" | "table"
	onViewChange: (v: "grid" | "table") => void
	onView: (id: string) => void
	onDelete: (id: string) => void
}) {
	if (submissions.length === 0) return null

	return (
		<>
			<SubmissionsHeader
				label={label}
				count={submissions.length}
				view={view}
				onViewChange={onViewChange}
			/>
			{view === "grid" ? (
				<SubmissionGrid
					submissions={submissions}
					onView={onView}
					onDelete={onDelete}
				/>
			) : (
				<SubmissionTable
					submissions={submissions}
					onView={onView}
					onDeleteRequest={onDelete}
				/>
			)}
		</>
	)
}

export function SubmissionsTabContent({
	workflow,
	inProgressSubmissions,
	markedSubmissions,
	totalSubmissions,
	view,
	onViewChange,
	onOpenStaging,
	onViewJob,
	onDeleteSubmission,
}: {
	workflow: ScriptsWorkflowState | null
	inProgressSubmissions: SubmissionHistoryItem[]
	markedSubmissions: SubmissionHistoryItem[]
	totalSubmissions: number
	view: "grid" | "table"
	onViewChange: (v: "grid" | "table") => void
	onOpenStaging: () => void
	onViewJob: (id: string) => void
	onDeleteSubmission: (id: string) => void
}) {
	return (
		<>
			{workflow && (
				<BatchStatusBanner
					workflow={workflow}
					onReviewClick={onOpenStaging}
				/>
			)}

			<SubmissionSection
				label="In progress"
				submissions={inProgressSubmissions}
				view={view}
				onViewChange={onViewChange}
				onView={onViewJob}
				onDelete={onDeleteSubmission}
			/>

			<SubmissionSection
				label="Marked"
				submissions={markedSubmissions}
				view={view}
				onViewChange={onViewChange}
				onView={onViewJob}
				onDelete={onDeleteSubmission}
			/>

			{!workflow && totalSubmissions === 0 && (
				<div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
					No submissions yet. Click &ldquo;Upload scripts&rdquo; to mark your
					first student script.
				</div>
			)}
		</>
	)
}
