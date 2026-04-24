"use client"

import { queryKeys } from "@/lib/query-keys"
import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useRef } from "react"
import { jobStagesSchema } from "./schema"
import { invalidateOnStageTransitions } from "./transitions"
import type { JobStages } from "./types"

/**
 * Opens a persistent SSE connection to /api/submissions/:jobId/events and
 * mirrors every snapshot/update event into the React Query cache under
 * `queryKeys.jobStages(jobId)`. Consumers keep using `useQuery` against that
 * key — this hook just replaces polling with a push feed.
 *
 * - Native EventSource auto-reconnect handles transient drops and the
 *   Lambda 15-min hard timeout. The first event on every reconnect is a
 *   fresh `snapshot` that supersedes any stale cache state.
 * - Connection is closed when the tab backgrounds (visibilitychange) and
 *   reopened on focus — saves Lambda duration on idle tabs.
 */
export function useJobStream(jobId: string): void {
	const queryClient = useQueryClient()
	const esRef = useRef<EventSource | null>(null)
	const prevStagesRef = useRef<JobStages | null>(null)

	const connect = useCallback(() => {
		if (esRef.current) return
		const es = new EventSource(`/api/submissions/${jobId}/events`)
		esRef.current = es

		const apply = (e: MessageEvent) => {
			// Parse + validate at the boundary. jobStagesSchema validates
			// shape + enum values and coerces ISO-string dates back to Date
			// objects so the cache shape matches the queryFn path (Next.js
			// server actions preserve Date natively).
			let raw: unknown
			try {
				raw = JSON.parse(e.data)
			} catch {
				console.warn("[SSE] Malformed JSON in frame")
				return
			}
			const result = jobStagesSchema.safeParse(raw)
			if (!result.success) {
				console.warn("[SSE] Zod rejected frame", result.error.format())
				return
			}

			const next = result.data
			const prev = prevStagesRef.current

			console.log("[SSE]", e.type, {
				ocr: next.ocr.status,
				grading: next.grading.status,
				annotation: next.annotation.status,
				prevOcr: prev?.ocr.status ?? null,
				prevGrading: prev?.grading.status ?? null,
				prevAnnotation: prev?.annotation.status ?? null,
			})

			queryClient.setQueryData<JobStages>(queryKeys.jobStages(jobId), next)

			// Fan out: when a stage flips to `done`, dependent queries
			// (studentJob, jobScanPages, jobPageTokens, jobAnnotations) hold
			// stale data until they refetch. Trigger that refetch here
			// rather than leaving each consumer to poll defensively.
			invalidateOnStageTransitions(queryClient, jobId, prev, next)

			prevStagesRef.current = next
		}

		es.addEventListener("open", () => console.log("[SSE] open"))
		es.addEventListener("error", (err) => console.warn("[SSE] error", err))
		es.addEventListener("snapshot", apply)
		es.addEventListener("update", apply)
		// Ignore `ping` event — just a keep-alive.
	}, [jobId, queryClient])

	const disconnect = useCallback(() => {
		esRef.current?.close()
		esRef.current = null
	}, [])

	useEffect(() => {
		connect()

		const onVisibility = () => {
			if (document.hidden) {
				disconnect()
			} else {
				connect()
			}
		}
		document.addEventListener("visibilitychange", onVisibility)

		return () => {
			document.removeEventListener("visibilitychange", onVisibility)
			disconnect()
		}
	}, [connect, disconnect])
}
