"use client"

import { getJobPageTokens, getJobScanPages } from "@/lib/marking/scan/queries"
import { getJobStages } from "@/lib/marking/stages/queries"
import type { JobStages } from "@/lib/marking/stages/types"
import { getStudentPaperJobForPaper } from "@/lib/marking/submissions/queries"
import type { StudentPaperJobPayload } from "@/lib/marking/types"
import { queryKeys } from "@/lib/query-keys"
import { useQuery } from "@tanstack/react-query"

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

	const { data: jobData } = useQuery<StudentPaperJobPayload | null>({
		queryKey: queryKeys.studentJob(jobId ?? ""),
		queryFn: async () => {
			if (!jobId) return null
			const result = await getStudentPaperJobForPaper({ examPaperId, jobId })
			return result?.data?.data ?? null
		},
		enabled: active,
		staleTime: 0,
	})

	const { data: scanPages = [] } = useQuery({
		queryKey: queryKeys.jobScanPages(jobId ?? ""),
		queryFn: async () => {
			if (!jobId) return []
			const result = await getJobScanPages({ jobId })
			return result?.data?.pages ?? []
		},
		enabled: active,
		staleTime: Number.POSITIVE_INFINITY,
	})

	const { data: pageTokens = [] } = useQuery({
		queryKey: queryKeys.jobPageTokens(jobId ?? ""),
		queryFn: async () => {
			if (!jobId) return []
			const result = await getJobPageTokens({ jobId })
			return result?.data?.tokens ?? []
		},
		enabled: active,
		staleTime: Number.POSITIVE_INFINITY,
	})

	const { data: stages } = useQuery<JobStages | null>({
		queryKey: queryKeys.jobStages(jobId ?? ""),
		queryFn: async () => {
			if (!jobId) return null
			const result = await getJobStages({ jobId })
			return result?.data?.stages ?? null
		},
		enabled: active,
		staleTime: 0,
	})

	const isLoading = active && (!jobData || !stages)

	return { jobData, scanPages, pageTokens, stages, isLoading }
}
