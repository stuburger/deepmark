"use client"

import { retriggerGrading, retriggerOcr } from "@/lib/marking/stages/mutations"
import { getJobStages } from "@/lib/marking/stages/queries"
import { type JobStages, allTerminal } from "@/lib/marking/stages/types"
import { queryKeys } from "@/lib/query-keys"
import {
	type UseMutationResult,
	useMutation,
	useQuery,
} from "@tanstack/react-query"
import { toast } from "sonner"

/**
 * Reads the JobStages cache entry maintained by the SSE stream (mounted
 * once in `SubmissionView` via `useJobStream`).
 *
 * SSE is the primary push channel, but it's not infallible — EventSource
 * reconnects on transient drops, dev-server reloads can leave a zombie
 * connection, and the `visibilitychange` listener tears the stream down
 * when the tab backgrounds. To avoid stranding the UI with a stale stage
 * status, this hook also polls at 2s while any stage is non-terminal and
 * stops once everything's terminal — same shape as `useJobQuery`.
 */
export function useStageData(jobId: string): JobStages | null {
	const { data } = useQuery<JobStages | null>({
		queryKey: queryKeys.jobStages(jobId),
		queryFn: async () => {
			const r = await getJobStages(jobId)
			if (!r.ok) throw new Error(r.error)
			return r.stages
		},
		staleTime: Number.POSITIVE_INFINITY,
		refetchInterval: (query) => {
			const stages = query.state.data
			if (stages && allTerminal(stages)) return false
			return 2000
		},
	})

	return data ?? null
}

type RetriggerResult = Awaited<ReturnType<typeof retriggerOcr>>
export type StageRetriggerMutation = UseMutationResult<
	RetriggerResult,
	unknown,
	void,
	unknown
>

/**
 * Mutations for the OCR and grading stage re-run actions. Navigates to the
 * new submission id on success (re-running OCR or grading produces a new
 * submission; see `retriggerOcr` / `retriggerGrading`).
 */
export function useStageMutations(
	jobId: string,
	onNavigate: (newJobId: string) => void,
): {
	ocrMutation: StageRetriggerMutation
	gradingMutation: StageRetriggerMutation
} {
	const ocrMutation = useMutation({
		mutationFn: () => retriggerOcr(jobId),
		onSuccess: (r) => {
			if (!r.ok) return toast.error(r.error)
			onNavigate(r.newJobId)
		},
		onError: () => toast.error("Failed to re-scan"),
	})

	const gradingMutation = useMutation({
		mutationFn: () => retriggerGrading(jobId),
		onSuccess: (r) => {
			if (!r.ok) return toast.error(r.error)
			onNavigate(r.newJobId)
		},
		onError: () => toast.error("Failed to re-grade"),
	})

	return { ocrMutation, gradingMutation }
}
