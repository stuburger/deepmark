import type { OcrStatus } from "@mcp-gcse/db"

/**
 * Window after which a `processing` OcrRun is considered abandoned
 * (Lambda crashed mid-flight, container died, etc.) and the next
 * invocation can take over. Picked at ~3× a long OCR run; tighten
 * once we see real distributions.
 */
export const STALE_PROCESSING_MS = 15 * 60 * 1000

export type ClaimResult =
	| { ok: true }
	| {
			ok: false
			reason: "already_complete" | "already_processing" | "already_failed"
	  }

/**
 * Minimal prisma-like surface needed by `claimOcrRun`. Lets the
 * function be tested with an in-memory fake without standing up Postgres.
 * Methods accept a small subset of Prisma's args — only the shape we
 * actually use here.
 */
export type OcrRunStore = {
	updateMany(args: {
		where: {
			id: string
			OR: Array<
				| { status: { in: OcrStatus[] } }
				| { status: OcrStatus; started_at: { lt: Date } }
			>
		}
		data: { status: OcrStatus; started_at: Date; error: null }
	}): Promise<{ count: number }>
	findUnique(args: {
		where: { id: string }
		select: { status: true }
	}): Promise<{ status: OcrStatus } | null>
	create(args: {
		data: {
			id: string
			submission_id: string
			status: OcrStatus
			started_at: Date
		}
	}): Promise<unknown>
}

/**
 * Atomically claim the OcrRun for `jobId`. If another Lambda has already
 * claimed it (status=processing within the stale window), finished
 * (status=complete), or terminally failed (status=failed), returns
 * `{ ok: false, reason }` and the caller acks the SQS message without
 * doing work. Otherwise the caller owns the run and proceeds to OCR.
 *
 * `failed` is INTENTIONALLY non-claimable. Submissions are immutable —
 * the architectural retry path is user-initiated `retriggerGrading` /
 * `re-scan`, which clones the submission and creates a new OcrRun. SQS
 * auto-retries on a deterministic failure (e.g. attribution validation
 * error) would otherwise mutate the same submission's tokens and answer
 * regions on every redelivery, doubling token rows (no unique
 * constraint on word position) and silently burning Cloud Vision /
 * Gemini calls. Making `failed` sticky turns SQS retries into no-op
 * acks for failed runs — the user explicitly re-scans if they want a
 * fresh attempt.
 *
 * The race we're guarding against: SQS at-least-once delivery + a slow
 * poller ack window can re-deliver a message whose handler already
 * wrote `status='complete'`. Without this claim the second invocation
 * upserts the row back to `processing`, clobbering the success and
 * setting the same DLQ-clobber chain in motion that the markJobFailed
 * status guard prevents at the other end. The grading processor
 * already does this via `claimGradingRun` — this is the symmetric fix
 * for OCR.
 *
 * Implementation: a single `updateMany` with the eligibility condition
 * in the WHERE clause. Postgres serializes the update; whichever
 * Lambda's UPDATE wins atomically takes the run, the others see
 * `count: 0`. Then we check whether the row existed at all to
 * disambiguate "we won" vs "row didn't exist yet" vs "someone else
 * owns it". The cold-start case (no row) falls through to a `create`
 * which races safely on the unique `id` constraint — P2002 means
 * another Lambda just won the create.
 */
export async function claimOcrRun(
	store: OcrRunStore,
	jobId: string,
	now: Date = new Date(),
): Promise<ClaimResult> {
	const staleCutoff = new Date(now.getTime() - STALE_PROCESSING_MS)

	const updated = await store.updateMany({
		where: {
			id: jobId,
			OR: [
				// Never started (lifecycle row pre-created at submit time) or
				// admin-cancelled (eligible for re-open) — fair game. `failed`
				// is deliberately excluded; see header for why.
				{ status: { in: ["pending", "cancelled"] } },
				// Stale processing — previous Lambda died, take over.
				{ status: "processing", started_at: { lt: staleCutoff } },
			],
		},
		data: { status: "processing", started_at: now, error: null },
	})

	if (updated.count === 1) return { ok: true }

	const existing = await store.findUnique({
		where: { id: jobId },
		select: { status: true },
	})
	if (!existing) {
		try {
			await store.create({
				data: {
					id: jobId,
					submission_id: jobId,
					status: "processing",
					started_at: now,
				},
			})
			return { ok: true }
		} catch (err) {
			const code = (err as { code?: string }).code
			if (code === "P2002") return { ok: false, reason: "already_processing" }
			throw err
		}
	}

	if (existing.status === "complete") {
		return { ok: false, reason: "already_complete" }
	}
	if (existing.status === "failed") {
		return { ok: false, reason: "already_failed" }
	}
	return { ok: false, reason: "already_processing" }
}
