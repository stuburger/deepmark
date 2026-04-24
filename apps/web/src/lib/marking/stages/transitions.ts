import { queryKeys } from "@/lib/query-keys"
import type { QueryClient } from "@tanstack/react-query"
import type { JobStages } from "./types"

/**
 * Downstream queries that depend on specific stage transitions. When a stage
 * flips to `done`, its dependents hold stale data until they refetch.
 *
 * The SSE stream only pushes JobStages — not the full payload, tokens, or
 * annotations (those have different lifecycles and bigger payloads). When a
 * stage completes, we invalidate the queries that carry the now-fresh data so
 * they refetch via their existing queryFn paths.
 */
type TransitionInvalidator = (queryClient: QueryClient, jobId: string) => void

const onOcrComplete: TransitionInvalidator = (queryClient, jobId) => {
	// extracted_answers, page_analyses on the payload
	queryClient.invalidateQueries({ queryKey: queryKeys.studentJob(jobId) })
	// page.analysis populates after OCR
	queryClient.invalidateQueries({ queryKey: queryKeys.jobScanPages(jobId) })
	// word tokens are written by the OCR processor
	queryClient.invalidateQueries({ queryKey: queryKeys.jobPageTokens(jobId) })
}

const onGradingComplete: TransitionInvalidator = (queryClient, jobId) => {
	// grading_results, total_awarded, examiner_summary
	queryClient.invalidateQueries({ queryKey: queryKeys.studentJob(jobId) })
}

const onAnnotationComplete: TransitionInvalidator = (queryClient, jobId) => {
	queryClient.invalidateQueries({ queryKey: queryKeys.jobAnnotations(jobId) })
}

/**
 * Compare previous and current stages. For each stage that transitioned from
 * non-done to done, invalidate its dependent queries so they refetch fresh.
 *
 * Handles `null` prev (first snapshot) by doing nothing — the initial page
 * load already fetches everything; invalidation only matters on transitions
 * that happen while the user is on the page.
 */
export function invalidateOnStageTransitions(
	queryClient: QueryClient,
	jobId: string,
	prev: JobStages | null,
	next: JobStages,
): void {
	if (!prev) return

	if (prev.ocr.status !== "done" && next.ocr.status === "done") {
		onOcrComplete(queryClient, jobId)
	}
	if (prev.grading.status !== "done" && next.grading.status === "done") {
		onGradingComplete(queryClient, jobId)
	}
	if (prev.annotation.status !== "done" && next.annotation.status === "done") {
		onAnnotationComplete(queryClient, jobId)
	}
}
