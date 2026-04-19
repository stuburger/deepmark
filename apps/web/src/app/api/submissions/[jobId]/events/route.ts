import { auth } from "@/lib/auth"
import { getJobStages } from "@/lib/marking/stages/queries"
import {
	fingerprint,
	formatSseEvent,
	sleepWithAbort,
} from "@/lib/marking/stages/sse-utils"
import type { JobStages } from "@/lib/marking/stages/types"
import { allTerminal } from "@/lib/marking/stages/types"
import type { NextRequest } from "next/server"

const SSE_HEADERS = {
	"Content-Type": "text/event-stream",
	"Cache-Control": "no-cache, no-transform",
	Connection: "keep-alive",
	// Hint to intermediaries (nginx, CloudFront) not to buffer
	"X-Accel-Buffering": "no",
} as const

const ACTIVE_INTERVAL_MS = 2_000
const IDLE_INTERVAL_MS = 15_000
const HEARTBEAT_INTERVAL_MS = 30_000

/**
 * Persistent SSE stream of per-stage status for a submission.
 *
 * Lifecycle:
 *   - emits `snapshot` once on connect
 *   - emits `update` on every state change
 *   - emits `ping` every ~30s as heartbeat (keeps CloudFront / proxies from
 *     buffering and keeps the socket live)
 *   - polls at 2s while any stage is non-terminal, 15s when all terminal
 *   - closes when client disconnects (request.signal.abort)
 *
 * The connection is never closed proactively — even after every stage reaches
 * a terminal state we keep polling slowly so teacher-triggered re-runs
 * (OCR / grading / annotation) surface without requiring a reconnect.
 */
export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ jobId: string }> },
) {
	const session = await auth()
	if (!session) {
		return new Response("Unauthorized", { status: 401 })
	}

	const { jobId } = await params

	const encoder = new TextEncoder()
	const signal = request.signal

	const stream = new ReadableStream({
		async start(controller) {
			const write = (event: string, data: unknown) => {
				try {
					controller.enqueue(encoder.encode(formatSseEvent(event, data)))
				} catch {
					// Controller closed — ignore
				}
			}

			const readStages = async (): Promise<JobStages | null> => {
				const r = await getJobStages(jobId)
				return r.ok ? r.stages : null
			}

			const initial = await readStages()
			if (!initial) {
				write("error", { message: "Job not found" })
				controller.close()
				return
			}
			write("snapshot", initial)
			console.log(
				`[SSE:${jobId.slice(-6)}] open`,
				initial.ocr.status,
				initial.grading.status,
				initial.annotation.status,
			)

			let lastFp = fingerprint(initial)
			let lastStages = initial
			let lastHeartbeatAt = Date.now()
			let tickCount = 0

			while (!signal.aborted) {
				const interval = allTerminal(lastStages)
					? IDLE_INTERVAL_MS
					: ACTIVE_INTERVAL_MS

				const { aborted } = await sleepWithAbort(interval, signal)
				if (aborted) break

				const stages = await readStages()
				if (!stages) continue
				lastStages = stages
				tickCount++

				const fp = fingerprint(stages)
				if (fp !== lastFp) {
					write("update", stages)
					console.log(
						`[SSE:${jobId.slice(-6)}] update tick=${tickCount}`,
						stages.ocr.status,
						stages.grading.status,
						stages.annotation.status,
					)
					lastFp = fp
				}

				if (Date.now() - lastHeartbeatAt >= HEARTBEAT_INTERVAL_MS) {
					write("ping", { t: Date.now() })
					lastHeartbeatAt = Date.now()
				}
			}

			console.log(`[SSE:${jobId.slice(-6)}] closed after ${tickCount} ticks`)
			controller.close()
		},
	})

	return new Response(stream, { headers: SSE_HEADERS })
}
