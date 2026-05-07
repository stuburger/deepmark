"use client"

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { SubmissionView } from "../../mark/papers/[examPaperId]/submissions/[jobId]/submission-view"
import { SubmissionViewSkeleton } from "../../mark/papers/[examPaperId]/submissions/[jobId]/submission-view-skeleton"
import { useMarkingJobData } from "./hooks/use-marking-job-data"

export function MarkingJobDialog({
	examPaperId,
	jobId,
	open,
	onOpenChange,
	onNavigateToJob,
}: {
	examPaperId: string
	jobId: string | null
	open: boolean
	onOpenChange: (open: boolean) => void
	onNavigateToJob: (newJobId: string) => void
}) {
	const { jobData, scanPages, pageTokens, stages, isLoading } =
		useMarkingJobData({ examPaperId, jobId, enabled: open })

	const ready = !isLoading && jobData && stages && jobId

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent size="fullscreen" showCloseButton={false}>
				<DialogTitle className="sr-only">Submission</DialogTitle>
				{ready ? (
					<SubmissionView
						examPaperId={examPaperId}
						jobId={jobId}
						initialData={jobData}
						scanPages={scanPages}
						pageTokens={pageTokens}
						initialStages={stages}
						onNavigateToJob={onNavigateToJob}
						onClose={() => onOpenChange(false)}
					/>
				) : (
					<SubmissionViewSkeleton />
				)}
			</DialogContent>
		</Dialog>
	)
}
