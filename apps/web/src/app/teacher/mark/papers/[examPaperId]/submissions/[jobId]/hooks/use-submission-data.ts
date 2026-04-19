"use client"

import { getJobAnnotations } from "@/lib/marking/annotations/queries"
import {
	getJobPageTokens,
	getJobScanPageUrls,
} from "@/lib/marking/scan/queries"
import { type MarkingPhase, derivePhase } from "@/lib/marking/stages/phase"
import { getJobStages } from "@/lib/marking/stages/queries"
import type { JobStages } from "@/lib/marking/stages/types"
import { useJobStream } from "@/lib/marking/stages/use-job-stream"
import type {
	PageToken,
	ScanPageUrl,
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
	initialScanPages: ScanPageUrl[]
	initialPageTokens: PageToken[]
	initialStages: JobStages
}

export type UseSubmissionDataResult = {
	data: StudentPaperJobPayload
	stages: JobStages
	scanPages: ScanPageUrl[]
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
			const r = await getJobStages(jobId)
			if (!r.ok) throw new Error(r.error)
			return r.stages
		},
		initialData: initialStages,
		staleTime: Number.POSITIVE_INFINITY,
	})

	const { data: scanPages } = useQuery({
		queryKey: queryKeys.jobScanUrls(jobId),
		queryFn: async () => {
			const r = await getJobScanPageUrls(jobId)
			return r.ok ? r.pages : []
		},
		initialData: initialScanPages,
		staleTime: Number.POSITIVE_INFINITY,
	})

	const { data: pageTokens } = useQuery({
		queryKey: queryKeys.jobPageTokens(jobId),
		queryFn: async () => {
			const r = await getJobPageTokens(jobId)
			return r.ok ? r.tokens : []
		},
		initialData: initialPageTokens,
		staleTime: Number.POSITIVE_INFINITY,
	})

	// Annotations — fetched once on mount and re-fetched when annotation
	// completes (see the effect below). Teacher edits update the cache
	// directly via useAnnotationSync, so no polling is needed.
	const { data: annotations = [] } = useQuery<StudentPaperAnnotation[]>({
		queryKey: queryKeys.jobAnnotations(jobId),
		queryFn: async () => {
			const r = await getJobAnnotations(jobId)
			return r.ok ? r.annotations : []
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

	// OCR done → invalidate scan URLs so page.analysis data is fetched.
	const prevPhaseRef = useRef(phase)
	useEffect(() => {
		if (
			prevPhaseRef.current === "scan_processing" &&
			phase === "marking_in_progress"
		) {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.jobScanUrls(jobId),
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
