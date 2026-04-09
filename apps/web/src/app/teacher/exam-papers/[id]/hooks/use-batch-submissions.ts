import { commitBatch, splitStagedScript } from "@/lib/batch/mutations"
import {
	getActiveBatchForPaper,
	getStagedScriptPageUrls,
} from "@/lib/batch/queries"
import type {
	ActiveBatchInfo,
	ScriptsWorkflowState,
} from "@/lib/batch/types"
import { listSubmissionsForPaper } from "@/lib/marking/listing/queries"
import type { SubmissionHistoryItem } from "@/lib/marking/types"
import { queryKeys } from "@/lib/query-keys"
import { useQuery } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { TERMINAL_STATUSES } from "../submission-grid-config"

// ─── Pure mapper ────────────────────────────────────────────────────────────

function mapBatchToWorkflow(
	batch: ActiveBatchInfo,
	urls: Record<string, string>,
): ScriptsWorkflowState | null {
	if (!batch) return null

	const phase = batch.status as "classifying" | "staging" | "marking"

	const submittedIds = new Set(
		batch.student_jobs
			.map((j) => j.staged_script_id)
			.filter(Boolean),
	)
	const unsubmittedScripts = batch.staged_scripts.filter(
		(s) => !submittedIds.has(s.id),
	)

	const completedCount = batch.student_jobs.filter(
		(j) => j.status === "ocr_complete",
	).length

	return {
		phase,
		isProcessing: phase === "classifying",
		isReadyForReview: phase === "staging",
		isMarking: phase === "marking",
		allScripts: batch.staged_scripts,
		unsubmittedScripts,
		markingJobs: batch.student_jobs,
		markingProgress: {
			completed: completedCount,
			total: batch.total_student_jobs,
			percent:
				batch.total_student_jobs > 0
					? Math.round((completedCount / batch.total_student_jobs) * 100)
					: 0,
		},
		urls,
		pagesPerScript: batch.pages_per_script,
		classificationMode: batch.classification_mode,
	}
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useBatchSubmissions({
	paperId,
	initialSubmissions,
}: {
	paperId: string
	initialSubmissions: SubmissionHistoryItem[]
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
		})

	// Presigned URLs for page images — fetched once per batch
	const batchId = activeBatch?.id ?? null
	const { data: urls = {} } = useQuery({
		queryKey: ["batchPageUrls", batchId],
		queryFn: async () => {
			if (!batchId) return {}
			const r = await getStagedScriptPageUrls(batchId)
			return r.ok ? r.urls : {}
		},
		enabled: batchId !== null,
		staleTime: Number.POSITIVE_INFINITY,
	})

	// Derive the UI-facing workflow state
	const scriptsWorkflow = useMemo(
		() => mapBatchToWorkflow(activeBatch ?? null, urls),
		[activeBatch, urls],
	)

	// Live submissions list — polls every 3s while marking is active
	const { data: submissions = [] } = useQuery({
		queryKey: queryKeys.submissions(paperId),
		queryFn: async () => {
			const r = await listSubmissionsForPaper(paperId)
			return r.ok ? r.submissions : []
		},
		initialData: initialSubmissions,
		refetchInterval: scriptsWorkflow?.isMarking ? 3000 : false,
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

	async function handleSplitScript(
		scriptId: string,
		splitAfterIndex: number,
	) {
		const r = await splitStagedScript(scriptId, splitAfterIndex)
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
		scriptsWorkflow,
		refetchWorkflow: refetchActiveBatch,
		submissions,
		markedSubmissions,
		inProgressSubmissions,
		committingBatch,
		handleCommitAll,
		handleSplitScript,
	}
}
