import { randomUUID } from "node:crypto"
import {
	TEST_EXAM_PAPER_ID,
	TEST_USER_ID,
	db,
	ensureExamPaper,
} from "@mcp-gcse/test-utils"
import { NextRequest } from "next/server"
import { beforeAll, describe, expect, it, vi } from "vitest"

// The SSE route calls `auth()` before starting the stream. Stub it so the
// route yields a session without needing a real cookie jar.
vi.mock("@/lib/auth", () => ({
	auth: async () => ({ userId: TEST_USER_ID }),
}))

// Same-package import — no cross-boundary violation. Must be after vi.mock.
const { GET } = await import(
	"../../src/app/api/submissions/[jobId]/events/route"
)

beforeAll(async () => {
	await ensureExamPaper()
})

type SseEvent = { event: string; data: string }

/**
 * Parses an SSE byte stream into typed events. Buffers partial frames across
 * `read()` calls so `event:`/`data:` pairs separated by any chunk boundary
 * still surface as a single event.
 */
async function* sseEvents(
	body: ReadableStream<Uint8Array>,
): AsyncGenerator<SseEvent> {
	const reader = body.getReader()
	const decoder = new TextDecoder()
	let buffer = ""
	try {
		while (true) {
			const { value, done } = await reader.read()
			if (done) return
			buffer += decoder.decode(value, { stream: true })
			while (true) {
				const idx = buffer.indexOf("\n\n")
				if (idx === -1) break
				const frame = buffer.slice(0, idx)
				buffer = buffer.slice(idx + 2)
				let event = "message"
				let data = ""
				for (const line of frame.split("\n")) {
					if (line.startsWith("event: ")) event = line.slice("event: ".length)
					else if (line.startsWith("data: ")) data = line.slice("data: ".length)
				}
				yield { event, data }
			}
		}
	} finally {
		reader.releaseLock()
	}
}

async function waitForEvent(
	iter: AsyncGenerator<SseEvent>,
	type: string,
): Promise<SseEvent> {
	for await (const ev of iter) {
		if (ev.event === type) return ev
	}
	throw new Error(`Stream ended before "${type}" event arrived`)
}

describe("SSE route /api/submissions/[jobId]/events", () => {
	it("emits snapshot, pushes update on status flip, and closes on abort", async () => {
		const start = Date.now()

		const jobId = randomUUID()
		await db.studentSubmission.create({
			data: {
				id: jobId,
				exam_paper_id: TEST_EXAM_PAPER_ID,
				uploaded_by: TEST_USER_ID,
				s3_key: `test/sse-route/${jobId}.pdf`,
				s3_bucket: "test-bucket",
				exam_board: "AQA",
				pages: [],
			},
		})
		const ocr = await db.ocrRun.create({
			data: { submission_id: jobId, status: "complete" },
		})
		const grading = await db.gradingRun.create({
			data: {
				submission_id: jobId,
				ocr_run_id: ocr.id,
				status: "processing",
			},
		})

		const controller = new AbortController()
		try {
			const request = new NextRequest(
				`http://localhost/api/submissions/${jobId}/events`,
				{ signal: controller.signal },
			)
			const response = await GET(request, {
				params: Promise.resolve({ jobId }),
			})

			expect(response.status).toBe(200)
			expect(response.headers.get("content-type")).toBe("text/event-stream")
			expect(response.body).not.toBeNull()
			const body = response.body as ReadableStream<Uint8Array>
			const events = sseEvents(body)

			// 1. Snapshot — seeded state
			const snapshot = await waitForEvent(events, "snapshot")
			const snapshotData = JSON.parse(snapshot.data)
			expect(snapshotData.jobId).toBe(jobId)
			expect(snapshotData.ocr.status).toBe("done")
			expect(snapshotData.grading.status).toBe("generating")
			expect(snapshotData.annotation.status).toBe("not_started")

			// 2. Flip grading → complete; next 2s poll should emit an update
			await db.gradingRun.update({
				where: { id: grading.id },
				data: { status: "complete", completed_at: new Date() },
			})

			const update = await waitForEvent(events, "update")
			const updateData = JSON.parse(update.data)
			expect(updateData.grading.status).toBe("done")

			// 3. Abort — server loop should break and close the stream.
			controller.abort()

			// Drain the iterator to completion so we know the server-side loop
			// honoured the abort rather than keeping a zombie poll alive.
			for await (const _ of events) {
				// no-op — just wait for the stream to end
			}

			const elapsed = Date.now() - start
			expect(elapsed).toBeLessThan(30_000)
		} finally {
			await db.gradingRun.deleteMany({ where: { submission_id: jobId } })
			await db.ocrRun.deleteMany({ where: { submission_id: jobId } })
			await db.studentSubmission.delete({ where: { id: jobId } })
			if (!controller.signal.aborted) controller.abort()
		}
	}, 30_000)
})
