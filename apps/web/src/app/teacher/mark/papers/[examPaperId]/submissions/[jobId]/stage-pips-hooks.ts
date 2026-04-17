"use client"

import { retriggerGrading, retriggerOcr } from "@/lib/marking/stages/mutations"
import { getJobStages } from "@/lib/marking/stages/queries"
import type { JobStages } from "@/lib/marking/stages/types"
import { queryKeys } from "@/lib/query-keys"
import {
	type UseMutationResult,
	useMutation,
	useQuery,
} from "@tanstack/react-query"
import { toast } from "sonner"

/**
 * Reads the JobStages cache entry maintained by the SSE stream. The stream
 * itself is mounted once at the top of the view tree (see `useJobStream` in
 * `SubmissionView`) — this hook is a pure cache read and won't open its own
 * connection.
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
