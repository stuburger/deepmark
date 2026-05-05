import { deriveProgress } from "@/lib/batch/events"
import { commitBatch } from "@/lib/batch/lifecycle/mutations"
import { getActiveBatchForPaper } from "@/lib/batch/lifecycle/queries"
import {
	bulkUpdateStagedScriptStatus,
	createEmptyStagedScript,
	splitStagedScript,
	updateStagedScript,
} from "@/lib/batch/scripts/mutations"
import type {
	ActiveBatchInfo,
	BatchIngestionState,
	StagedScript,
} from "@/lib/batch/types"
import {
	parseInsufficientBalanceError,
	surfaceMarkingError,
} from "@/lib/billing/error-toast"
import { queryKeys } from "@/lib/query-keys"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useMemo } from "react"
import { toast } from "sonner"

// ─── Pure mapper ────────────────────────────────────────────────────────────

function mapBatchToIngestionState(
	paperId: string,
	batch: ActiveBatchInfo,
): BatchIngestionState | null {
	if (!batch) return null

	const phase = batch.status as
		| "classifying"
		| "staging"
		| "marking"
		| "failed"

	const unsubmittedScripts = batch.staged_scripts.filter(
		(s) => s.status !== "submitted",
	)

	return {
		phase,
		isProcessing: phase === "classifying",
		isReadyForReview: phase === "staging",
		isFailed: phase === "failed",
		batchId: batch.id,
		paperId,
		allScripts: batch.staged_scripts,
		unsubmittedScripts,
		progress: deriveProgress(batch.events),
	}
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useBatchIngestion(
	paperId: string,
	options: {
		/**
		 * Called when commitBatch fails because the user doesn't have enough
		 * paper credit. The shell uses this to open a richer cap-bite modal
		 * (top-up + see-plans) instead of the generic upgrade toast.
		 */
		onCapBite?: (message: string) => void
	} = {},
) {
	const queryClient = useQueryClient()

	// Active batch — polls every 3s while classifying or staging (short-lived phases)
	const { data: activeBatch, refetch: refetchActiveBatch } =
		useQuery<ActiveBatchInfo>({
			queryKey: queryKeys.activeBatch(paperId),
			queryFn: async () => {
				const r = await getActiveBatchForPaper({ examPaperId: paperId })
				return r?.data?.batch ?? null
			},
			refetchInterval: (q) => {
				const b = q.state.data
				// Poll while in flight (classifying, staging) — stop once we
				// reach a terminal state (marking, failed) where nothing else
				// will change without explicit user action.
				return b?.status === "classifying" || b?.status === "staging"
					? 3000
					: false
			},
		})

	// Derive the UI-facing ingestion state
	const ingestion = useMemo(
		() => mapBatchToIngestionState(paperId, activeBatch ?? null),
		[paperId, activeBatch],
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
			const r = await commitBatch({ batchJobId: currentBatchId })
			if (r?.serverError) throw new Error(r.serverError)
			return r?.data
		},
		onError: (err) => {
			const parsed = parseInsufficientBalanceError(err)
			if (parsed.isInsufficientBalance && options.onCapBite) {
				options.onCapBite(parsed.message)
				return
			}
			surfaceMarkingError(
				err instanceof Error ? err : "Failed to start marking",
			)
		},
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
			const r = await splitStagedScript({ scriptId, splitAfterIndex })
			if (r?.serverError) throw new Error(r.serverError)
			return r?.data
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
			const r = await createEmptyStagedScript({ batchJobId: currentBatchId })
			if (r?.serverError) throw new Error(r.serverError)
			return r?.data
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
			const r = await updateStagedScript({
				scriptId,
				updates: { confirmedName: name },
			})
			if (r?.serverError) throw new Error(r.serverError)
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
			const r = await updateStagedScript({
				scriptId,
				updates: { status: newStatus },
			})
			if (r?.serverError) throw new Error(r.serverError)
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

	// ── Toggle all unsubmitted scripts included/excluded ─────────────────────

	const toggleIncludeAllMutation = useMutation({
		mutationFn: async ({
			batchId,
			targetStatus,
		}: {
			batchId: string
			targetStatus: "confirmed" | "excluded"
		}) => {
			const r = await bulkUpdateStagedScriptStatus({
				batchId,
				status: targetStatus,
			})
			if (r?.serverError) throw new Error(r.serverError)
		},
		onMutate: async ({ targetStatus }) => {
			const queryKey = queryKeys.activeBatch(paperId)
			await queryClient.cancelQueries({ queryKey })
			const previous = queryClient.getQueryData<ActiveBatchInfo>(queryKey)
			queryClient.setQueryData<ActiveBatchInfo>(queryKey, (old) => {
				if (!old) return old
				return {
					...old,
					staged_scripts: old.staged_scripts.map((s) =>
						s.status === "submitted" ? s : { ...s, status: targetStatus },
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
				err instanceof Error ? err.message : "Failed to update all scripts",
			)
		},
		onSettled: invalidateBatch,
	})

	async function handleToggleIncludeAll(): Promise<void> {
		if (!activeBatch) return
		const unsubmitted = activeBatch.staged_scripts.filter(
			(s) => s.status !== "submitted",
		)
		if (unsubmitted.length === 0) return
		const allConfirmed = unsubmitted.every((s) => s.status === "confirmed")
		const targetStatus = allConfirmed ? "excluded" : "confirmed"
		try {
			await toggleIncludeAllMutation.mutateAsync({
				batchId: activeBatch.id,
				targetStatus,
			})
		} catch {
			// Error already surfaced via mutation's onError toast
		}
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
		handleToggleIncludeAll,
	}
}
