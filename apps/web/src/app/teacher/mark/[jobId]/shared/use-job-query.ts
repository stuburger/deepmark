"use client"

import { getStudentPaperJob } from "@/lib/marking/submissions/queries"
import type { StudentPaperJobPayload } from "@/lib/marking/types"
import { queryKeys } from "@/lib/query-keys"
import { useQuery } from "@tanstack/react-query"
import { derivePhase } from "./phase"

const TERMINAL_PHASES = new Set(["completed", "failed", "cancelled"])

/**
 * Subscribes to live job data via TanStack Query.
 * Polls automatically while the job is in a non-terminal phase,
 * using a faster interval during marking_in_progress (2s) and slower otherwise (5s).
 * Polling stops automatically once a terminal phase is reached.
 */
export function useJobQuery(
	jobId: string,
	initialData?: StudentPaperJobPayload,
) {
	return useQuery({
		queryKey: queryKeys.studentJob(jobId),
		queryFn: async () => {
			const r = await getStudentPaperJob(jobId)
			if (!r.ok) throw new Error(r.error)
			return r.data
		},
		initialData,
		staleTime: 0,
		refetchInterval: (query) => {
			const data = query.state.data
			if (!data) return 5000
			const phase = derivePhase(data)
			if (TERMINAL_PHASES.has(phase)) return false
			return phase === "marking_in_progress" ? 2000 : 5000
		},
	})
}
