"use client"

import { getJobPageTokens, getJobScanPages } from "@/lib/marking/scan/queries"
import { getJobStages } from "@/lib/marking/stages/queries"
import type { JobStages } from "@/lib/marking/stages/types"
import { getStudentPaperJob } from "@/lib/marking/submissions/queries"
import type { StudentPaperJobPayload } from "@/lib/marking/types"
import { queryKeys } from "@/lib/query-keys"
import { useQuery } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { SubmissionView } from "../../mark/papers/[examPaperId]/submissions/[jobId]/submission-view"

/**
 * Client-side wrapper for the standalone submission page. Mirrors the
 * data-loading pattern from MarkingJobDialog so SubmissionView is only
 * mounted after the four queries hydrate — the dialog already proves this
 * shape doesn't trigger duplicate-Yjs / duplicate-QueryClient bundling
 * issues that surfaced when SubmissionView was rendered directly under
 * an RSC server component.
 */
export function SubmissionPageClient({
	jobId,
	examPaperId,
	paperAccessible,
}: {
	jobId: string
	examPaperId: string
	paperAccessible: boolean
}) {
	const { data: jobData } = useQuery<StudentPaperJobPayload | null>({
		queryKey: queryKeys.studentJob(jobId),
		queryFn: async () => {
			const r = await getStudentPaperJob({ jobId })
			return r?.data?.data ?? null
		},
		staleTime: 0,
	})

	const { data: scanPages = [] } = useQuery({
		queryKey: queryKeys.jobScanPages(jobId),
		queryFn: async () => {
			const r = await getJobScanPages({ jobId })
			return r?.data?.pages ?? []
		},
		staleTime: Number.POSITIVE_INFINITY,
	})

	const { data: pageTokens = [] } = useQuery({
		queryKey: queryKeys.jobPageTokens(jobId),
		queryFn: async () => {
			const r = await getJobPageTokens({ jobId })
			return r?.data?.tokens ?? []
		},
		staleTime: Number.POSITIVE_INFINITY,
	})

	const { data: stages } = useQuery<JobStages | null>({
		queryKey: queryKeys.jobStages(jobId),
		queryFn: async () => {
			const r = await getJobStages({ jobId })
			return r?.data?.stages ?? null
		},
		staleTime: 0,
	})

	if (!jobData || !stages) {
		return (
			<div className="fixed inset-0 z-40 flex items-center justify-center bg-background">
				<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
			</div>
		)
	}

	return (
		<div className="fixed inset-0 z-40 flex flex-col bg-background">
			<SubmissionView
				examPaperId={examPaperId}
				jobId={jobId}
				initialData={jobData}
				scanPages={scanPages}
				pageTokens={pageTokens}
				initialStages={stages}
				paperAccessible={paperAccessible}
			/>
		</div>
	)
}
