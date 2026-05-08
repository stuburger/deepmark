"use client"

import { queryKeys } from "@/lib/query-keys"
import { useQuery } from "@tanstack/react-query"
import { getAdjacentSubmissions } from "./queries"

export type BatchAdjacency = {
	prevId: string | null
	nextId: string | null
	totalCount: number
	confirmedCount: number
}

/**
 * Batch context for a single submission view: prev/next ids for navigation
 * plus batch totals (total submissions, how many confirmed) so consumers can
 * render progress without firing their own count query. Single React Query
 * cache key, multiple consumers — fetched once per (examPaperId, jobId).
 */
export function useAdjacentSubmissions(examPaperId: string, jobId: string) {
	return useQuery<BatchAdjacency>({
		queryKey: queryKeys.adjacentSubmissions(examPaperId, jobId),
		queryFn: async () => {
			const r = await getAdjacentSubmissions({ examPaperId, jobId })
			if (r?.serverError) throw new Error(r.serverError)
			return (
				r?.data ?? {
					prevId: null,
					nextId: null,
					totalCount: 0,
					confirmedCount: 0,
				}
			)
		},
		staleTime: 30_000,
	})
}
