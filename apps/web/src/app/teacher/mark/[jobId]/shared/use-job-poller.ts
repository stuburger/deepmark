"use client"

import {
	type StudentPaperJobPayload,
	getStudentPaperJob,
} from "@/lib/mark-actions"
import { useEffect } from "react"

/**
 * Polls the job on the given interval while `enabled` is true.
 * Calls `onResult` with fresh data each tick. Stops automatically when
 * `enabled` becomes false or the component unmounts.
 */
export function useJobPoller({
	jobId,
	intervalMs,
	enabled,
	onResult,
}: {
	jobId: string
	intervalMs: number
	enabled: boolean
	onResult: (data: StudentPaperJobPayload) => void
}) {
	useEffect(() => {
		if (!enabled) return

		let cancelled = false

		async function tick() {
			const result = await getStudentPaperJob(jobId)
			if (cancelled || !result.ok) return
			onResult(result.data)
		}

		void tick()
		const id = setInterval(tick, intervalMs)

		return () => {
			cancelled = true
			clearInterval(id)
		}
		// onResult is intentionally excluded — callers should stabilise it with useCallback
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [jobId, intervalMs, enabled])
}
