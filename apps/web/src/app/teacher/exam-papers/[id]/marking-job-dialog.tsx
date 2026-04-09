"use client"

import { Dialog, DialogContent } from "@/components/ui/dialog"
import { getJobPageTokens, getJobScanPageUrls } from "@/lib/marking/scan/queries"
import { getStudentPaperJobForPaper } from "@/lib/marking/submissions/queries"
import type { StudentPaperJobPayload } from "@/lib/marking/types"
import { queryKeys } from "@/lib/query-keys"
import { useQuery } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { derivePhase } from "../../mark/papers/[examPaperId]/submissions/[jobId]/phase"
import { SubmissionView } from "../../mark/papers/[examPaperId]/submissions/[jobId]/submission-view"

export function MarkingJobDialog({
	examPaperId,
	jobId,
	open,
	onOpenChange,
}: {
	examPaperId: string
	jobId: string | null
	open: boolean
	onOpenChange: (open: boolean) => void
}) {
	const enabled = open && !!jobId

	// Three separate queries keyed correctly so that SubmissionView's internal
	// queries (useJobQuery, jobScanUrls, jobPageTokens) hit warm cache immediately
	// instead of seeing a mis-typed combined object under the same key.
	const { data: jobData } = useQuery<StudentPaperJobPayload | null>({
		queryKey: queryKeys.studentJob(jobId ?? ""),
		queryFn: async () => {
			if (!jobId) return null
			const result = await getStudentPaperJobForPaper(examPaperId, jobId)
			return result.ok ? result.data : null
		},
		enabled,
		staleTime: 0,
	})

	const { data: scanPages = [] } = useQuery({
		queryKey: queryKeys.jobScanUrls(jobId ?? ""),
		queryFn: async () => {
			if (!jobId) return []
			const result = await getJobScanPageUrls(jobId)
			return result.ok ? result.pages : []
		},
		enabled,
		staleTime: Number.POSITIVE_INFINITY,
	})

	const { data: pageTokens = [] } = useQuery({
		queryKey: queryKeys.jobPageTokens(jobId ?? ""),
		queryFn: async () => {
			if (!jobId) return []
			const result = await getJobPageTokens(jobId)
			return result.ok ? result.tokens : []
		},
		enabled,
		staleTime: Number.POSITIVE_INFINITY,
	})

	const isLoading = enabled && !jobData

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="!top-0 !left-0 !translate-x-0 !translate-y-0 !max-w-none !w-screen !h-screen !rounded-none p-0 overflow-hidden ring-0">
				{isLoading || !jobData || !jobId ? (
					<div className="flex h-full items-center justify-center">
						<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
					</div>
				) : (
					<SubmissionView
						examPaperId={examPaperId}
						jobId={jobId}
						initialData={jobData}
						scanPages={scanPages}
						pageTokens={pageTokens}
						initialPhase={derivePhase(jobData)}
					/>
				)}
			</DialogContent>
		</Dialog>
	)
}
