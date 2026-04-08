import { commitBatch } from "@/lib/batch/mutations"
import { getActiveBatchForPaper } from "@/lib/batch/queries"
import type { ActiveBatchInfo } from "@/lib/batch/types"
import { listSubmissionsForPaper } from "@/lib/marking/queries"
import type { SubmissionHistoryItem } from "@/lib/marking/types"
import { queryKeys } from "@/lib/query-keys"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { toast } from "sonner"
import { TERMINAL_STATUSES } from "../submission-grid-config"

export function useBatchSubmissions({
	paperId,
	initialSubmissions,
	stagingOpen,
	setStagingOpen,
}: {
	paperId: string
	initialSubmissions: SubmissionHistoryItem[]
	stagingOpen: boolean
	setStagingOpen: (open: boolean) => void
}) {
	const [committingBatch, setCommittingBatch] = useState(false)

	// Active batch — polls every 3s while classifying, staging, or marking
	const { data: activeBatch, refetch: refetchActiveBatch } =
		useQuery<ActiveBatchInfo>({
			queryKey: ["activeBatch", paperId],
			queryFn: async () => {
				const r = await getActiveBatchForPaper(paperId)
				return r.ok ? r.batch : null
			},
			refetchInterval: (q) => {
				const b = q.state.data
				return b?.status === "classifying" ||
					b?.status === "staging" ||
					b?.status === "marking"
					? 3000
					: false
			},
			// Auto-open the staging dialog when classification completes
			select: (batch) => {
				if (batch?.status === "staging" && !stagingOpen) {
					setStagingOpen(true)
				}
				return batch
			},
		})

	// Live submissions list — polls every 3s while marking is active
	const { data: submissions = [] } = useQuery({
		queryKey: queryKeys.submissions(paperId),
		queryFn: async () => {
			const r = await listSubmissionsForPaper(paperId)
			return r.ok ? r.submissions : []
		},
		initialData: initialSubmissions,
		refetchInterval: activeBatch?.status === "marking" ? 3000 : false,
	})

	async function handleCommitAll() {
		if (!activeBatch) return
		setCommittingBatch(true)
		const r = await commitBatch(activeBatch.id)
		setCommittingBatch(false)
		if (!r.ok) {
			toast.error(r.error)
			return
		}
		void refetchActiveBatch()
	}

	// Split submissions into terminal (marked) and in-progress sections
	const markedSubmissions = submissions.filter((s) =>
		TERMINAL_STATUSES.has(s.status),
	)
	const inProgressSubmissions = submissions.filter(
		(s) => !TERMINAL_STATUSES.has(s.status),
	)

	return {
		activeBatch,
		refetchActiveBatch,
		submissions,
		markedSubmissions,
		inProgressSubmissions,
		committingBatch,
		handleCommitAll,
	}
}
