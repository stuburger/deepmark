"use client"

import { getJobPageTokens, getJobScanPages } from "@/lib/marking/scan/queries"
import { getJobStages } from "@/lib/marking/stages/queries"
import type { JobStages } from "@/lib/marking/stages/types"
import { getStudentPaperJobForPaper } from "@/lib/marking/submissions/queries"
import type {
	PageToken,
	ScanPage,
	StudentPaperJobPayload,
} from "@/lib/marking/types"
import { queryKeys } from "@/lib/query-keys"
import { useQuery } from "@tanstack/react-query"

// Stable empty-array constants. `tokensQuery.data ?? []` would allocate a
// new `[]` per render while the query is pending, which cascades into
// re-binding the editor's transaction listeners every render (via
// useQuestionAlignments → useDerivedAnnotations). Module-scoped constants
// fix the identity. They're not frozen because Object.freeze on an empty
// array protects against nothing — the consumer chain types `PageToken[]`
// and downstream code should not mutate these arrays anyway.
const EMPTY_PAGE_TOKENS: PageToken[] = []
const EMPTY_SCAN_PAGES: ScanPage[] = []

export function useMarkingJobData({
	examPaperId,
	jobId,
	enabled,
}: {
	examPaperId: string
	jobId: string | null
	enabled: boolean
}) {
	const active = enabled && !!jobId

	const jobQuery = useQuery<StudentPaperJobPayload | null>({
		queryKey: queryKeys.studentJob(jobId ?? ""),
		queryFn: async () => {
			if (!jobId) return null
			const result = await getStudentPaperJobForPaper({ examPaperId, jobId })
			if (result?.serverError) throw new Error(result.serverError)
			return result?.data?.data ?? null
		},
		enabled: active,
		retry: false,
		staleTime: 0,
	})

	const scanQuery = useQuery({
		queryKey: queryKeys.jobScanPages(jobId ?? ""),
		queryFn: async () => {
			if (!jobId) return []
			const result = await getJobScanPages({ jobId })
			if (result?.serverError) throw new Error(result.serverError)
			return result?.data?.pages ?? []
		},
		enabled: active,
		retry: false,
		staleTime: Number.POSITIVE_INFINITY,
	})

	const tokensQuery = useQuery({
		queryKey: queryKeys.jobPageTokens(jobId ?? ""),
		queryFn: async () => {
			if (!jobId) return []
			const result = await getJobPageTokens({ jobId })
			if (result?.serverError) throw new Error(result.serverError)
			return result?.data?.tokens ?? []
		},
		enabled: active,
		retry: false,
		staleTime: Number.POSITIVE_INFINITY,
	})

	const stagesQuery = useQuery<JobStages | null>({
		queryKey: queryKeys.jobStages(jobId ?? ""),
		queryFn: async () => {
			if (!jobId) return null
			const result = await getJobStages({ jobId })
			if (result?.serverError) throw new Error(result.serverError)
			return result?.data?.stages ?? null
		},
		enabled: active,
		retry: false,
		staleTime: 0,
	})

	const error =
		jobQuery.error ??
		stagesQuery.error ??
		scanQuery.error ??
		tokensQuery.error ??
		null

	// A resolved-but-null jobData/stages means the server returned no row
	// without raising an error (shouldn't happen for valid jobIds, but treat
	// it as not-found rather than as "still loading" so the dialog can render
	// an error state instead of skeleton-looping forever).
	const notFound =
		active &&
		!error &&
		((jobQuery.isSuccess && jobQuery.data === null) ||
			(stagesQuery.isSuccess && stagesQuery.data === null))

	const isLoading =
		active &&
		!error &&
		!notFound &&
		(jobQuery.isPending || stagesQuery.isPending)

	return {
		jobData: jobQuery.data ?? null,
		scanPages: scanQuery.data ?? EMPTY_SCAN_PAGES,
		pageTokens: tokensQuery.data ?? EMPTY_PAGE_TOKENS,
		stages: stagesQuery.data ?? null,
		isLoading,
		error: error ?? (notFound ? new Error("Submission not found") : null),
	}
}
