"use client"

import { saveAnnotationEdits } from "@/lib/marking/annotations/mutations"
import type { StudentPaperAnnotation } from "@/lib/marking/types"
import { queryKeys } from "@/lib/query-keys"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useRef } from "react"
import { toast } from "sonner"

const DEBOUNCE_MS = 500

/**
 * Unified sync of editor-derived annotations with the React Query cache and
 * the server.
 *
 *   PM editor change
 *      → setQueryData (instant UI via cache)
 *      → debounce 500ms
 *      → save mutation (persists to DB)
 *
 * The React Query cache is now the single source of truth for annotations:
 *   - AI marks enter via the `jobAnnotations` query
 *   - Teacher marks enter via `setQueryData` on every editor transaction
 *   - Spatial-only marks (MCQ/deterministic, not represented in PM) are
 *     preserved across cache writes via the merge callback
 *
 * Race-prevention:
 *   - `onMutate` cancels any in-flight `jobAnnotations` refetch so a stale
 *     server snapshot can't overwrite the teacher's optimistic cache state
 *   - `onSettled` invalidates to reconcile with authoritative server state
 *   - `onError` toasts and invalidates (rolls back to server truth)
 *
 * Returns a callback that should be passed to `onDerivedAnnotations` on
 * `AnnotatedAnswerSheet`. The sheet's `useDerivedAnnotations` hook fires it
 * on every meaningful PM transaction.
 */
export function useAnnotationSync(jobId: string) {
	const queryClient = useQueryClient()
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const pendingRef = useRef<StudentPaperAnnotation[] | null>(null)

	const { mutate } = useMutation({
		mutationFn: async (derived: StudentPaperAnnotation[]) => {
			const result = await saveAnnotationEdits(jobId, derived)
			if (!result.ok) throw new Error(result.error)
			return result
		},
		onMutate: async () => {
			// Prevent an in-flight refetch from overwriting the cache we just
			// optimistically wrote to. Any refetch that was about to land
			// now either aborts or its result is discarded.
			await queryClient.cancelQueries({
				queryKey: queryKeys.jobAnnotations(jobId),
			})
		},
		onError: (err) => {
			toast.error(
				err instanceof Error ? err.message : "Failed to save annotations",
			)
			queryClient.invalidateQueries({
				queryKey: queryKeys.jobAnnotations(jobId),
			})
		},
		onSettled: () => {
			queryClient.invalidateQueries({
				queryKey: queryKeys.jobAnnotations(jobId),
			})
		},
	})

	useEffect(() => {
		return () => {
			if (timerRef.current) clearTimeout(timerRef.current)
		}
	}, [])

	return useCallback(
		(derived: StudentPaperAnnotation[]) => {
			// Instant UI update: write the teacher's state to the cache,
			// merging with spatial-only marks (MCQ/deterministic) that live
			// outside the PM document and aren't captured in `derived`.
			queryClient.setQueryData<StudentPaperAnnotation[]>(
				queryKeys.jobAnnotations(jobId),
				(prev = []) => {
					const spatialOnly = prev.filter(
						(a) => !a.anchor_token_start_id || !a.anchor_token_end_id,
					)
					return [...derived, ...spatialOnly]
				},
			)

			// Debounced persistence
			pendingRef.current = derived
			if (timerRef.current) clearTimeout(timerRef.current)
			timerRef.current = setTimeout(() => {
				const toSave = pendingRef.current
				if (toSave) mutate(toSave)
			}, DEBOUNCE_MS)
		},
		[jobId, queryClient, mutate],
	)
}
