"use client"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { SubmissionView } from "../../mark/papers/[examPaperId]/submissions/[jobId]/submission-view"
import { SubmissionViewSkeleton } from "../../mark/papers/[examPaperId]/submissions/[jobId]/submission-view-skeleton"
import { CollabServiceBanner } from "./collab-service-banner"
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
	const { jobData, scanPages, pageTokens, stages, isLoading, error } =
		useMarkingJobData({ examPaperId, jobId, enabled: open })

	const ready = !isLoading && !error && jobData && stages && jobId

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent size="fullscreen" showCloseButton={false}>
				<DialogTitle className="sr-only">Submission</DialogTitle>
				<CollabServiceBanner />
				{error ? (
					<div className="flex h-full flex-col items-center justify-center gap-4 p-8">
						<h2 className="text-lg font-semibold text-foreground">
							Couldn't load this submission
						</h2>
						<p className="max-w-md text-center text-sm text-muted-foreground">
							{error.message}
						</p>
						<Button variant="outline" onClick={() => onOpenChange(false)}>
							Close
						</Button>
					</div>
				) : ready ? (
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
