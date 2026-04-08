"use client"

import { getSimilarQuestionsForPaper } from "@/lib/exam-paper/similarity"
import type { SimilarPair } from "@/lib/exam-paper/types"
import { queryKeys } from "@/lib/query-keys"
import { useQuery } from "@tanstack/react-query"

export function useSimilarQuestions(paperId: string) {
	return useQuery<SimilarPair[]>({
		queryKey: queryKeys.similarQuestions(paperId),
		queryFn: async () => {
			const r = await getSimilarQuestionsForPaper(paperId)
			if (!r.ok) return []
			return r.pairs
		},
	})
}
