"use client"

import type { StudentPaperAnnotation } from "@/lib/marking/types"
import { queryKeys } from "@/lib/query-keys"
import { useQueryClient } from "@tanstack/react-query"
import { useCallback } from "react"

/**
 * Mirrors editor-derived annotations into the `jobAnnotations` React Query
 * cache so the scan viewer (bounding-box overlay) stays in sync with the
 * editor as the teacher edits.
 *
 *   PM editor change
 *     → useDerivedAnnotations fires callback
 *     → this hook updates the React Query cache
 *     → ScanPanel (reads `annotations` via useSubmissionData) re-renders
 *
 * Teacher-edit persistence now lives in the Y.Doc (K-5), not in Neon via
 * `saveAnnotationEdits`. The K-7 projection Lambda handles AI-annotation
 * DB materialisation. This hook therefore has no server-side write path —
 * cache updates are pure UI sync.
 *
 * Spatial-only marks (MCQ/deterministic, not in the PM document) live
 * outside the editor and must be preserved across cache writes.
 */
export function useAnnotationCacheSync(jobId: string) {
	const queryClient = useQueryClient()

	return useCallback(
		(derived: StudentPaperAnnotation[]) => {
			queryClient.setQueryData<StudentPaperAnnotation[]>(
				queryKeys.jobAnnotations(jobId),
				(prev = []) => {
					const spatialOnly = prev.filter(
						(a) => !a.anchor_token_start_id || !a.anchor_token_end_id,
					)
					return [...derived, ...spatialOnly]
				},
			)
		},
		[jobId, queryClient],
	)
}
