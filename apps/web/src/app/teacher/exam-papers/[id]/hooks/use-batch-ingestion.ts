import { commitBatch } from "@/lib/batch/lifecycle/mutations"
import { getActiveBatchForPaper } from "@/lib/batch/lifecycle/queries"
import {
	createEmptyStagedScript,
	splitStagedScript,
	updateStagedScript,
} from "@/lib/batch/scripts/mutations"
import { getStagedScriptPageUrls } from "@/lib/batch/scripts/queries"
import type {
	ActiveBatchInfo,
	BatchIngestionState,
	StagedScript,
} from "@/lib/batch/types"
import { queryKeys } from "@/lib/query-keys"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useMemo } from "react"
import { toast } from "sonner"

// ─── Pure mapper ────────────────────────────────────────────────────────────

function mapBatchToIngestionState(
	paperId: string,
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
		paperId,
		allScripts: batch.staged_scripts,
		unsubmittedScripts,
		urls,
	}
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useBatchIngestion(paperId: string) {
	const queryClient = useQueryClient()

	// Active batch — polls every 3s while classifying or staging (short-lived phases)
	const { data: activeBatch, refetch: refetchActiveBatch } =
		useQuery<ActiveBatchInfo>({
			queryKey: queryKeys.activeBatch(paperId),
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
		queryKey: queryKeys.batchPageUrls(batchId ?? ""),
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
		() => mapBatchToIngestionState(paperId, activeBatch ?? null, urls),
		[paperId, activeBatch, urls],
	)

	// ── Shared invalidation helper ───────────────────────────────────────────

	function invalidateBatch() {
		void queryClient.invalidateQueries({
			queryKey: queryKeys.activeBatch(paperId),
		})
	}

	// ── Commit batch ─────────────────────────────────────────────────────────

	const commitBatchMutation = useMutation({
		mutationFn: async (currentBatchId: string) => {
			const r = await commitBatch(currentBatchId)
			if (!r.ok) throw new Error(r.error)
			return r
		},
		onError: (err) =>
			toast.error(
				err instanceof Error ? err.message : "Failed to start marking",
			),
		onSettled: () => {
			// Invalidate both the batch (transitions to marking) and the
			// submissions list (new submissions were created by the commit)
			void queryClient.invalidateQueries({
				queryKey: queryKeys.activeBatch(paperId),
			})
			void queryClient.invalidateQueries({
				queryKey: queryKeys.submissions(paperId),
			})
		},
	})

	async function handleCommitAll(): Promise<void> {
		if (!activeBatch) return
		try {
			await commitBatchMutation.mutateAsync(activeBatch.id)
		} catch {
			// Error already surfaced via mutation's onError toast
		}
	}

	// ── Split script ─────────────────────────────────────────────────────────

	const splitScriptMutation = useMutation({
		mutationFn: async ({
			scriptId,
			splitAfterIndex,
		}: {
			scriptId: string
			splitAfterIndex: number
		}) => {
			const r = await splitStagedScript(scriptId, splitAfterIndex)
			if (!r.ok) throw new Error(r.error)
			return r
		},
		onError: (err) =>
			toast.error(
				err instanceof Error ? err.message : "Failed to split script",
			),
		onSettled: invalidateBatch,
	})

	function handleSplitScript(scriptId: string, splitAfterIndex: number) {
		splitScriptMutation.mutate({ scriptId, splitAfterIndex })
	}

	// ── Add empty script ─────────────────────────────────────────────────────

	const addScriptMutation = useMutation({
		mutationFn: async (currentBatchId: string) => {
			const r = await createEmptyStagedScript(currentBatchId)
			if (!r.ok) throw new Error(r.error)
			return r
		},
		onError: (err) =>
			toast.error(err instanceof Error ? err.message : "Failed to add script"),
		onSettled: invalidateBatch,
	})

	async function handleAddScript(): Promise<void> {
		if (!activeBatch) return
		try {
			await addScriptMutation.mutateAsync(activeBatch.id)
		} catch {
			// Error already surfaced via mutation's onError toast
		}
	}

	// ── Update script name ───────────────────────────────────────────────────

	const updateScriptNameMutation = useMutation({
		mutationFn: async ({
			scriptId,
			name,
		}: {
			scriptId: string
			name: string
		}) => {
			const r = await updateStagedScript(scriptId, { confirmedName: name })
			if (!r.ok) throw new Error(r.error)
		},
		onError: (err) =>
			toast.error(err instanceof Error ? err.message : "Failed to update name"),
		onSettled: invalidateBatch,
	})

	async function handleUpdateScriptName(
		scriptId: string,
		name: string,
	): Promise<void> {
		try {
			await updateScriptNameMutation.mutateAsync({ scriptId, name })
		} catch {
			// Error already surfaced via mutation's onError toast
		}
	}

	// ── Toggle script included/excluded ──────────────────────────────────────

	const toggleExcludeMutation = useMutation({
		mutationFn: async ({
			scriptId,
			currentStatus,
		}: {
			scriptId: string
			currentStatus: StagedScript["status"]
		}) => {
			const newStatus =
				currentStatus === "confirmed"
					? ("excluded" as const)
					: ("confirmed" as const)
			const r = await updateStagedScript(scriptId, { status: newStatus })
			if (!r.ok) throw new Error(r.error)
		},
		onMutate: async ({ scriptId, currentStatus }) => {
			const queryKey = queryKeys.activeBatch(paperId)
			await queryClient.cancelQueries({ queryKey })
			const previous = queryClient.getQueryData<ActiveBatchInfo>(queryKey)
			const newStatus =
				currentStatus === "confirmed"
					? ("excluded" as const)
					: ("confirmed" as const)
			queryClient.setQueryData<ActiveBatchInfo>(queryKey, (old) => {
				if (!old) return old
				return {
					...old,
					staged_scripts: old.staged_scripts.map((s) =>
						s.id === scriptId ? { ...s, status: newStatus } : s,
					),
				}
			})
			return { previous }
		},
		onError: (err, _vars, context) => {
			if (context?.previous !== undefined) {
				queryClient.setQueryData(
					queryKeys.activeBatch(paperId),
					context.previous,
				)
			}
			toast.error(
				err instanceof Error ? err.message : "Failed to update script status",
			)
		},
		onSettled: invalidateBatch,
	})

	// Returns a Promise so the component can rollback optimistic UI on rejection
	function handleToggleExclude(
		scriptId: string,
		currentStatus: StagedScript["status"],
	): Promise<void> {
		return toggleExcludeMutation
			.mutateAsync({ scriptId, currentStatus })
			.catch(() => {
				// Error already surfaced via mutation's onError toast;
				// re-throw so the caller can rollback its optimistic state
				throw new Error("toggle failed")
			})
	}

	return {
		ingestion,
		refetchIngestion: refetchActiveBatch,
		committingBatch: commitBatchMutation.isPending,
		handleCommitAll,
		handleSplitScript,
		handleAddScript,
		handleUpdateScriptName,
		handleToggleExclude,
	}
}
