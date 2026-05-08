"use client"

import { getJobStages } from "@/lib/marking/stages/queries"
import { type JobStages, allTerminal } from "@/lib/marking/stages/types"
import { queryKeys } from "@/lib/query-keys"
import { useQuery } from "@tanstack/react-query"

/**
 * Reads the JobStages cache entry maintained by the SSE stream (mounted
 * once in `SubmissionView` via `useJobStream`).
 *
 * SSE is the primary push channel, but it's not infallible — EventSource
 * reconnects on transient drops, dev-server reloads can leave a zombie
 * connection, and the `visibilitychange` listener tears the stream down
 * when the tab backgrounds. To avoid stranding the UI with a stale stage
 * status, this hook also polls at 2s while any stage is non-terminal and
 * stops once everything's terminal — same shape as `useJobQuery`.
 */
export function useStageData(jobId: string): JobStages | null {
	const { data } = useQuery<JobStages | null>({
		queryKey: queryKeys.jobStages(jobId),
		queryFn: async () => {
			const r = await getJobStages({ jobId })
			if (r?.serverError) throw new Error(r.serverError)
			return r?.data?.stages ?? null
		},
		staleTime: Number.POSITIVE_INFINITY,
		refetchInterval: (query) => {
			const stages = query.state.data
			if (stages && allTerminal(stages)) return false
			return 2000
		},
	})

	return data ?? null
}
