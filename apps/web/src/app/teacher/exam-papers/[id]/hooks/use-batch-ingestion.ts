import {
	commitBatch,
	createEmptyStagedScript,
	splitStagedScript,
} from "@/lib/batch/mutations"
import {
	getActiveBatchForPaper,
	getStagedScriptPageUrls,
} from "@/lib/batch/queries"
import type { ActiveBatchInfo, BatchIngestionState } from "@/lib/batch/types"
import { useQuery } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { toast } from "sonner"

// ─── Pure mapper ────────────────────────────────────────────────────────────

function mapBatchToIngestionState(
	batch: ActiveBatchInfo,
	urls: Record<string, string>,
): BatchIngestionState | null {
	if (!batch) return null

	const phase = batch.status as "classifying" | "staging" | "marking"

	const unsubmittedScripts = batch.staged_scripts.filter(
		(s) => s.status !== "submitted",
	)

	return {
		phase,
		isProcessing: phase === "classifying",
		isReadyForReview: phase === "staging",
		batchId: batch.id,
		allScripts: batch.staged_scripts,
		unsubmittedScripts,
		urls,
		pagesPerScript: batch.pages_per_script,
		classificationMode: batch.classification_mode,
	}
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useBatchIngestion(paperId: string) {
	const [committingBatch, setCommittingBatch] = useState(false)

	// Active batch — polls every 3s while classifying or staging (short-lived phases)
	const { data: activeBatch, refetch: refetchActiveBatch } =
		useQuery<ActiveBatchInfo>({
			queryKey: ["activeBatch", paperId],
			queryFn: async () => {
				const r = await getActiveBatchForPaper(paperId)
				return r.ok ? r.batch : null
			},
			refetchInterval: (q) => {
				const b = q.state.data
				return b?.status === "classifying" || b?.status === "staging"
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

	// Derive the UI-facing ingestion state
	const ingestion = useMemo(
		() => mapBatchToIngestionState(activeBatch ?? null, urls),
		[activeBatch, urls],
	)

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

	async function handleSplitScript(scriptId: string, splitAfterIndex: number) {
		const r = await splitStagedScript(scriptId, splitAfterIndex)
		if (!r.ok) {
			toast.error(r.error)
			return
		}
		void refetchActiveBatch()
	}

	async function handleAddScript() {
		if (!activeBatch) return
		const r = await createEmptyStagedScript(activeBatch.id)
		if (!r.ok) {
			toast.error(r.error)
			return
		}
		void refetchActiveBatch()
	}

	return {
		ingestion,
		refetchIngestion: refetchActiveBatch,
		committingBatch,
		handleCommitAll,
		handleSplitScript,
		handleAddScript,
	}
}
