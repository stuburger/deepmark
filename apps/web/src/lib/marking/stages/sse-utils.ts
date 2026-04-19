import type { JobStages, Stage } from "./types"

/** Serialises `data` as an SSE event frame. */
export function formatSseEvent(event: string, data: unknown): string {
	return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

/**
 * Compact fingerprint for detecting state change between polls.
 * Ignores timestamps that always advance (they are not meaningful to the UI).
 */
function stageFp(s: Stage): string {
	return `${s.status}|${s.runId ?? ""}|${s.error ?? ""}`
}

export function fingerprint(stages: JobStages): string {
	return `${stageFp(stages.ocr)}#${stageFp(stages.grading)}#${stageFp(stages.annotation)}`
}

/**
 * Sleep that respects an AbortSignal. Resolves early (with `aborted=true`)
 * when the signal fires, so we don't keep a zombie loop alive for up to 15s
 * after the client disconnects.
 */
export function sleepWithAbort(
	ms: number,
	signal: AbortSignal,
): Promise<{ aborted: boolean }> {
	return new Promise((resolve) => {
		if (signal.aborted) return resolve({ aborted: true })
		const t = setTimeout(() => {
			signal.removeEventListener("abort", onAbort)
			resolve({ aborted: false })
		}, ms)
		const onAbort = () => {
			clearTimeout(t)
			signal.removeEventListener("abort", onAbort)
			resolve({ aborted: true })
		}
		signal.addEventListener("abort", onAbort)
	})
}
