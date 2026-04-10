import { listSubmissionsForPaper } from "@/lib/marking/listing/queries"
import type { SubmissionHistoryItem } from "@/lib/marking/types"
import { queryKeys } from "@/lib/query-keys"
import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { TERMINAL_STATUSES } from "../submission-grid-config"

const POLL_INTERVAL_MS = 60_000

export function useSubmissions({
	paperId,
	initialSubmissions,
}: {
	paperId: string
	initialSubmissions: SubmissionHistoryItem[]
}) {
	const {
		data: submissions = [],
		refetch,
		isFetching,
	} = useQuery({
		queryKey: queryKeys.submissions(paperId),
		queryFn: async () => {
			const r = await listSubmissionsForPaper(paperId)
			return r.ok ? r.submissions : []
		},
		initialData: initialSubmissions,
		refetchInterval: POLL_INTERVAL_MS,
	})

	const { markedCount, inProgressCount } = useMemo(() => {
		let marked = 0
		let inProgress = 0
		for (const s of submissions) {
			if (TERMINAL_STATUSES.has(s.status)) marked++
			else inProgress++
		}
		return { markedCount: marked, inProgressCount: inProgress }
	}, [submissions])

	return {
		submissions,
		markedCount,
		inProgressCount,
		refetch,
		isFetching,
	}
}
