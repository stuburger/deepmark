"use client"

import { retriggerGrading, retriggerOcr } from "@/lib/marking/mutations"
import { getJobStages } from "@/lib/marking/stages/queries"
import type { JobStages } from "@/lib/marking/stages/types"
import { useJobStream } from "@/lib/marking/stages/use-job-stream"
import { queryKeys } from "@/lib/query-keys"
import { useMutation, useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { StagePip } from "./stage-pip"

/**
 * Three-pip cluster showing OCR / grading / enrichment status independently.
 * Each pip's popover exposes the corresponding re-run action.
 *
 * Data flow:
 *   - `useJobStream` holds a persistent SSE connection and writes into the
 *     React Query cache under `queryKeys.jobStages(jobId)`
 *   - `useQuery` reads from the cache with an initial SSR/CSR fallback fetch
 */
export function StagePips({
	jobId,
	onNavigateToJob,
	onReAnnotate,
}: {
	jobId: string
	onNavigateToJob: (newJobId: string) => void
	onReAnnotate?: () => void
}) {
	useJobStream(jobId)

	const { data } = useQuery<JobStages | null>({
		queryKey: queryKeys.jobStages(jobId),
		queryFn: async () => {
			const r = await getJobStages(jobId)
			if (!r.ok) throw new Error(r.error)
			return r.stages
		},
		staleTime: Number.POSITIVE_INFINITY,
	})

	const ocrMutation = useMutation({
		mutationFn: () => retriggerOcr(jobId),
		onSuccess: (r) => {
			if (!r.ok) return toast.error(r.error)
			onNavigateToJob(r.newJobId)
		},
		onError: () => toast.error("Failed to re-scan"),
	})

	const gradingMutation = useMutation({
		mutationFn: () => retriggerGrading(jobId),
		onSuccess: (r) => {
			if (!r.ok) return toast.error(r.error)
			onNavigateToJob(r.newJobId)
		},
		onError: () => toast.error("Failed to re-grade"),
	})

	if (!data) return null

	return (
		<div className="flex items-center gap-1.5">
			<StagePip
				stageKey="ocr"
				stage={data.ocr}
				onRerun={() => ocrMutation.mutate()}
				rerunDisabled={
					ocrMutation.isPending || data.ocr.status === "generating"
				}
			/>
			<StagePip
				stageKey="grading"
				stage={data.grading}
				onRerun={() => gradingMutation.mutate()}
				rerunDisabled={
					gradingMutation.isPending ||
					data.grading.status === "generating" ||
					data.ocr.status !== "done"
				}
			/>
			<StagePip
				stageKey="enrichment"
				stage={data.enrichment}
				onRerun={onReAnnotate}
				rerunDisabled={
					!onReAnnotate ||
					data.enrichment.status === "generating" ||
					data.grading.status !== "done"
				}
			/>
		</div>
	)
}
