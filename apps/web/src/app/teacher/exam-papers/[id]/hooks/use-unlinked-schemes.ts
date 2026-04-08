"use client"

import type { UnlinkedMarkScheme } from "@/lib/exam-paper/types"
import { getUnlinkedMarkSchemes } from "@/lib/exam-paper/unlinked-schemes"
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
