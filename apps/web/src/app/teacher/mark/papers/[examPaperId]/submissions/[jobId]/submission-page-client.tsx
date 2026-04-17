"use client"

import type { JobStages } from "@/lib/marking/stages/types"
import type {
	PageToken,
	ScanPageUrl,
	StudentPaperJobPayload,
} from "@/lib/marking/types"
import { useRouter } from "next/navigation"
import { useCallback } from "react"
import { SubmissionView } from "./submission-view"

/**
 * Client wrapper for the submission page route. Provides router-based
 * navigation callbacks around SubmissionView — when a re-grade/re-scan
 * produces a new submission id, we push to the new URL so the browser URL
 * reflects the current submission being viewed.
 *
 * The in-context dialog (`MarkingJobDialog`) uses a different wrapper that
 * keeps the user on the exam paper page and updates a query param; SubmissionView
 * itself doesn't care which entry point owns navigation.
 */
export function SubmissionPageClient({
	examPaperId,
	jobId,
	initialData,
	scanPages,
	pageTokens,
	initialStages,
}: {
	examPaperId: string
	jobId: string
	initialData: StudentPaperJobPayload
	scanPages: ScanPageUrl[]
	pageTokens: PageToken[]
	initialStages: JobStages
}) {
	const router = useRouter()

	const navigateToJob = useCallback(
		(newJobId: string) => {
			router.push(
				`/teacher/mark/papers/${examPaperId}/submissions/${newJobId}`,
			)
		},
		[router, examPaperId],
	)

	return (
		<SubmissionView
			examPaperId={examPaperId}
			jobId={jobId}
			initialData={initialData}
			scanPages={scanPages}
			pageTokens={pageTokens}
			initialStages={initialStages}
			onNavigateToJob={navigateToJob}
			onVersionChange={navigateToJob}
		/>
	)
}
