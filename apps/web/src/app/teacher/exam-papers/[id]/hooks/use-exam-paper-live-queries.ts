"use client"

import type { ExamPaperDetail } from "@/lib/exam-paper/queries"
import { getExamPaperDetail } from "@/lib/exam-paper/queries"
import { getExamPaperStats } from "@/lib/marking/queries"
import type { ExamPaperStats } from "@/lib/marking/types"
import type {
	ActiveExamPaperIngestionJob,
	PdfDocument,
} from "@/lib/pdf-ingestion/queries"
import { getExamPaperIngestionLiveState } from "@/lib/pdf-ingestion/queries"
import { queryKeys } from "@/lib/query-keys"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef } from "react"

const TERMINAL = new Set(["ocr_complete", "failed", "cancelled"])
const POLL_MS = 3000

export function useExamPaperLiveQueries({
	initialPaper,
	initialLiveState = { ok: true as const, jobs: [], documents: [] },
	initialAnalytics,
	activeTab,
}: {
	initialPaper: ExamPaperDetail
	initialLiveState?: {
		ok: true
		jobs: ActiveExamPaperIngestionJob[]
		documents: PdfDocument[]
	}
	initialAnalytics: ExamPaperStats | null
	activeTab: string
}) {
	const queryClient = useQueryClient()

	const { data: paper } = useQuery({
		queryKey: queryKeys.examPaper(initialPaper.id),
		queryFn: async () => {
			const r = await getExamPaperDetail(initialPaper.id)
			if (!r.ok) throw new Error(r.error)
			return r.paper
		},
		initialData: initialPaper,
	})

	const prevJobStatusesRef = useRef<Record<string, string>>({})
	const { data: liveState } = useQuery({
		queryKey: queryKeys.examPaperLiveState(paper.id),
		queryFn: async () => {
			const r = await getExamPaperIngestionLiveState(paper.id)
			if (!r.ok) throw new Error(r.error)
			return r
		},
		initialData: initialLiveState,
		refetchInterval: (q) => {
			const jobs = q.state.data?.jobs ?? []
			return jobs.some((j) => !TERMINAL.has(j.status)) ? POLL_MS : false
		},
	})

	// liveState is always defined — initialData guarantees it
	const jobs = liveState.jobs
	const completedDocs = liveState.documents

	// When ingestion jobs complete, invalidate paper data + related queries
	useEffect(() => {
		const currentIds = new Set(jobs.map((j) => j.id))
		let shouldRefresh = false

		for (const [id, prevStatus] of Object.entries(prevJobStatusesRef.current)) {
			if (!currentIds.has(id) && !TERMINAL.has(prevStatus)) {
				shouldRefresh = true
				break
			}
		}

		for (const job of jobs) {
			const prev = prevJobStatusesRef.current[job.id]
			if (
				prev !== undefined &&
				prev !== job.status &&
				TERMINAL.has(job.status)
			) {
				shouldRefresh = true
			}
			prevJobStatusesRef.current[job.id] = job.status
		}

		for (const id of Object.keys(prevJobStatusesRef.current)) {
			if (!currentIds.has(id)) {
				delete prevJobStatusesRef.current[id]
			}
		}

		if (shouldRefresh) {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.examPaper(paper.id),
			})
			void queryClient.invalidateQueries({
				queryKey: queryKeys.similarQuestions(paper.id),
			})
			void queryClient.invalidateQueries({
				queryKey: queryKeys.unlinkedMarkSchemes(paper.id),
			})
		}
	}, [jobs, paper.id, queryClient])

	// Analytics — seeded from SSR, refetches once on first tab activation if stale.
	// initialData is undefined (not null) when the SSR fetch failed so the query
	// still enters a loading state rather than showing an empty result.
	const { data: analyticsStats, isLoading: analyticsLoading } =
		useQuery<ExamPaperStats | null>({
			queryKey: queryKeys.examPaperStats(paper.id),
			queryFn: async () => {
				const r = await getExamPaperStats(paper.id)
				if (!r.ok) return null
				return r.stats
			},
			initialData: initialAnalytics ?? undefined,
			enabled: initialAnalytics != null || activeTab === "analytics",
			staleTime: 60 * 1000,
		})

	return { paper, jobs, completedDocs, analyticsStats, analyticsLoading }
}
