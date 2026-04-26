import type { GradingStatus } from "@mcp-gcse/db"

/**
 * Window after which a `processing` GradingRun is considered abandoned
 * (Lambda crashed mid-flight, container died, etc.) and the next
 * invocation can take over. Picked at ~3× a long grading run; tighten
 * once we see real distributions.
 */
export const STALE_PROCESSING_MS = 15 * 60 * 1000

export type ClaimResult =
	| { ok: true }
	| { ok: false; reason: "already_complete" | "already_processing" }

/**
 * Minimal prisma-like surface needed by `claimGradingRun`. Lets the
 * function be tested with an in-memory fake without standing up Postgres.
 * Methods accept a small subset of Prisma's args — only the shape we
 * actually use here.
 */
export type GradingRunStore = {
	updateMany(args: {
		where: {
			id: string
			OR: Array<
				| { status: { in: GradingStatus[] } }
				| { status: GradingStatus; started_at: { lt: Date } }
			>
		}
		data: { status: GradingStatus; started_at: Date; error: null }
	}): Promise<{ count: number }>
	findUnique(args: {
		where: { id: string }
		select: { status: true }
	}): Promise<{ status: GradingStatus } | null>
	create(args: {
		data: {
			id: string
			submission_id: string
			ocr_run_id: string
			status: GradingStatus
			started_at: Date
		}
	}): Promise<unknown>
}

/**
 * Atomically claim the GradingRun for `jobId`. If another Lambda has
 * already claimed it (status=processing within the stale window) or
 * finished (status=complete), returns `{ ok: false, reason }` and the
 * caller acks the SQS message without doing work. Otherwise the caller
 * owns the run and proceeds to grade.
 *
 * The race we're guarding against: Y.Doc CRDT inserts on a sequential
 * `Y.XmlFragment` are NOT idempotent across concurrent writers. Two
 * grade Lambdas opening the same submission with empty local replicas
 * both pass the per-view `findQuestionBlock` check, both insert blocks,
 * Yjs merges into 2× of every block. `insertQuestionBlock`'s
 * idempotency works for SEQUENTIAL invocations; serializing at the
 * Lambda level via this claim is what makes it sequential.
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
export async function claimGradingRun(
	store: GradingRunStore,
	jobId: string,
	now: Date = new Date(),
): Promise<ClaimResult> {
	const staleCutoff = new Date(now.getTime() - STALE_PROCESSING_MS)

	const updated = await store.updateMany({
		where: {
			id: jobId,
			OR: [
				// Never started (lifecycle row pre-created elsewhere) or in a
				// terminal-not-success state — fair game.
				{ status: { in: ["pending", "failed", "cancelled"] } },
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
					ocr_run_id: jobId,
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
	return { ok: false, reason: "already_processing" }
}
