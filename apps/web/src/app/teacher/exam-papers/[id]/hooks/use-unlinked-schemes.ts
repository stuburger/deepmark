"use client"

import type { UnlinkedMarkScheme } from "@/lib/exam-paper/queries"
import { getUnlinkedMarkSchemes } from "@/lib/exam-paper/queries"
import { queryKeys } from "@/lib/query-keys"
import { useQuery } from "@tanstack/react-query"

export function useUnlinkedSchemes(paperId: string) {
	return useQuery<UnlinkedMarkScheme[]>({
		queryKey: queryKeys.unlinkedMarkSchemes(paperId),
		queryFn: async () => {
			const r = await getUnlinkedMarkSchemes(paperId)
			if (!r.ok) return []
			return r.items
		},
	})
}
