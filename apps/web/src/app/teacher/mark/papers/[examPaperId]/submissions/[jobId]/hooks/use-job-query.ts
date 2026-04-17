"use client"

import { getStudentPaperJob } from "@/lib/marking/submissions/queries"
import type { StudentPaperJobPayload } from "@/lib/marking/types"
import type { JobStages } from "@/lib/marking/stages/types"
import { allTerminal } from "@/lib/marking/stages/types"
import { queryKeys } from "@/lib/query-keys"
import { useQuery, useQueryClient } from "@tanstack/react-query"

/**
 * Subscribes to live job data via TanStack Query.
 *
 * Polling cadence is driven by JobStages (the single source of truth for
 * pipeline status): polls at 2s while any stage is still active, stops once
 * every stage reaches a terminal state. JobStages itself is kept fresh by
 * the SSE stream in useJobStream — this query just piggy-backs on its
 * terminal signal to decide when to stop re-fetching the full payload.
 */
export function useJobQuery(
	jobId: string,
	initialData?: StudentPaperJobPayload,
) {
	const queryClient = useQueryClient()
	return useQuery({
		queryKey: queryKeys.studentJob(jobId),
		queryFn: async () => {
			const r = await getStudentPaperJob(jobId)
			if (!r.ok) throw new Error(r.error)
			return r.data
		},
		initialData,
		staleTime: 0,
		refetchInterval: () => {
			const stages = queryClient.getQueryData<JobStages | null>(
				queryKeys.jobStages(jobId),
			)
			if (stages && allTerminal(stages)) return false
			return 2000
		},
	})
}
