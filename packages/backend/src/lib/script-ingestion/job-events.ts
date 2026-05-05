import { Prisma } from "@mcp-gcse/db"

/**
 * Streaming progress events written to `BatchIngestJob.job_events` (JSONB
 * array) as the batch-classify Lambda runs. The UI polls this column and
 * renders a live progress card.
 *
 * Wire contract mirror: `apps/web/src/lib/batch/events.ts` (Zod schema).
 * Keep the two in lockstep.
 */
export type JobEventBody =
	| { kind: "started" }
	| { kind: "source_file_started"; sourceKey: string; totalPages: number }
	| {
			kind: "pages_extracted"
			sourceKey: string
			processed: number
			total: number
	  }
	| {
			kind: "vision_progress"
			sourceKey: string
			processed: number
			total: number
	  }
	| { kind: "segmentation_complete"; sourceKey: string; scriptCount: number }
	| { kind: "complete"; totalScripts: number }
	| { kind: "failed"; reason: string }

/**
 * Atomically append a single event to the batch's job_events array.
 * The COALESCE handles the initial null state. Failures are intentionally
 * swallowed — event-stream writes are nice-to-have observability, not
 * load-bearing for the pipeline's correctness.
 */
export async function appendJobEvent(
	batchId: string,
	event: JobEventBody,
): Promise<void> {
	const enriched = { ...event, at: new Date().toISOString() }
	try {
		// Lazy-load db so this module can be imported in unit tests that
		// don't have SST resource bindings active. The pdf-pages module
		// imports us at the top level, and its tests would otherwise fail
		// at module load with "SST links are not active".
		const { db } = await import("@/db")
		await db.$executeRaw(Prisma.sql`
			UPDATE batch_ingest_jobs
			SET job_events = COALESCE(job_events, '[]'::jsonb) || ${JSON.stringify([enriched])}::jsonb
			WHERE id = ${batchId}
		`)
	} catch {
		// observability-only; never fail the batch because progress write failed
	}
}
