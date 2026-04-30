"use client"

import { getJobAnnotations } from "@/lib/marking/annotations/queries"
import { getJobPageTokens, getJobScanPages } from "@/lib/marking/scan/queries"
import { type MarkingPhase, derivePhase } from "@/lib/marking/stages/phase"
import { getJobStages } from "@/lib/marking/stages/queries"
import type { JobStages } from "@/lib/marking/stages/types"
import { useJobStream } from "@/lib/marking/stages/use-job-stream"
import type {
	PageToken,
	ScanPage,
	StudentPaperAnnotation,
	StudentPaperJobPayload,
} from "@/lib/marking/types"
import { queryKeys } from "@/lib/query-keys"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef } from "react"
import { useJobQuery } from "./use-job-query"

const TERMINAL_SUBMISSION_STATUSES = new Set([
	"ocr_complete",
	"failed",
	"cancelled",
])

export type UseSubmissionDataArgs = {
	jobId: string
	initialData: StudentPaperJobPayload
	initialScanPages: ScanPage[]
	initialPageTokens: PageToken[]
	initialStages: JobStages
}

export type UseSubmissionDataResult = {
	data: StudentPaperJobPayload
	stages: JobStages
	scanPages: ScanPage[]
	pageTokens: PageToken[]
	annotations: StudentPaperAnnotation[]
	phase: MarkingPhase
	isTerminal: boolean
}

/**
 * One-stop hook for everything SubmissionView needs to render:
 * job payload, stages, scan pages, tokens, and annotations — all seeded
 * with SSR data and kept live via the SSE stream that this hook mounts
 * exactly once per view.
 *
 * Consolidates five co-dependent `useQuery` calls and two cache-invalidation
 * effects so the view component stays focused on UI state.
 */
export function useSubmissionData({
	jobId,
	initialData,
	initialScanPages,
	initialPageTokens,
	initialStages,
}: UseSubmissionDataArgs): UseSubmissionDataResult {
	const queryClient = useQueryClient()

	// Single SSE subscription — children read the jobStages cache entry.
	useJobStream(jobId)

	const { data: jobData } = useJobQuery(jobId, initialData)
	const data = jobData ?? initialData

	const { data: stages = initialStages } = useQuery<JobStages>({
		queryKey: queryKeys.jobStages(jobId),
		queryFn: async () => {
			const r = await getJobStages({ jobId })
			if (r?.serverError) throw new Error(r.serverError)
			if (!r?.data?.stages) throw new Error("Job not found")
			return r.data.stages
		},
		initialData: initialStages,
		staleTime: Number.POSITIVE_INFINITY,
	})

	const { data: scanPages } = useQuery({
		queryKey: queryKeys.jobScanPages(jobId),
		queryFn: async () => {
			const r = await getJobScanPages({ jobId })
			return r?.data?.pages ?? []
		},
		initialData: initialScanPages,
		staleTime: Number.POSITIVE_INFINITY,
	})

	const { data: pageTokens } = useQuery({
		queryKey: queryKeys.jobPageTokens(jobId),
		queryFn: async () => {
			const r = await getJobPageTokens({ jobId })
			return r?.data?.tokens ?? []
		},
		initialData: initialPageTokens,
		staleTime: Number.POSITIVE_INFINITY,
	})

	// Annotations — server-projected rows, fetched once on mount and
	// re-fetched when annotation completes (see the effect below). The cache
	// holds only the projection Lambda's output. Editor-derived (anchored)
	// annotations live in SubmissionView's local state and never write here;
	// callers that need the merged "live editor + spatial-only server" view
	// receive it from SubmissionView, not from this query.
	const { data: annotations = [] } = useQuery<StudentPaperAnnotation[]>({
		queryKey: queryKeys.jobAnnotations(jobId),
		queryFn: async () => {
			const r = await getJobAnnotations({ jobId })
			return r?.data?.annotations ?? []
		},
		staleTime: 0,
	})

	const phase = derivePhase(stages, data.exam_paper_id !== null)
	const isTerminal = TERMINAL_SUBMISSION_STATUSES.has(data.status)

	// Annotation done → invalidate annotations so AI marks stream in.
	const prevAnnotationStatusRef = useRef(stages.annotation.status)
	useEffect(() => {
		if (
			prevAnnotationStatusRef.current !== "done" &&
			stages.annotation.status === "done"
		) {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.jobAnnotations(jobId),
			})
		}
		prevAnnotationStatusRef.current = stages.annotation.status
	}, [stages.annotation.status, jobId, queryClient])

	// OCR done → invalidate scan pages so page.analysis data is fetched.
	const prevPhaseRef = useRef(phase)
	useEffect(() => {
		if (
			prevPhaseRef.current === "scan_processing" &&
			phase === "marking_in_progress"
		) {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.jobScanPages(jobId),
			})
		}
		prevPhaseRef.current = phase
	}, [phase, jobId, queryClient])

	return {
		data,
		stages,
		scanPages,
		pageTokens,
		annotations,
		phase,
		isTerminal,
	}
}
