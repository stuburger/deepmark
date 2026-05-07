import type { ProcessingBatchKind } from "@mcp-gcse/db"
import { db } from "./db"

export async function createTestBatch(examPaperId: string, userId: string) {
	return db.batchIngestJob.create({
		data: {
			exam_paper_id: examPaperId,
			uploaded_by: userId,
			status: "uploading",
		},
	})
}

/**
 * Creates a ProcessingBatch row tied to the given exam paper + user. Use this
 * when a test creates submissions and wants the completion check to settle
 * (the check filters on processing_batch_id, so submissions without one get
 * silently skipped from the count).
 *
 * `totalJobs` defaults to 0; pass the number of submissions you intend to
 * attach so the completion check trips at the right point.
 */
export async function createTestProcessingBatch(args: {
	examPaperId: string
	triggeredBy: string
	kind?: ProcessingBatchKind
	totalJobs?: number
}): Promise<{ id: string }> {
	const batch = await db.processingBatch.create({
		data: {
			exam_paper_id: args.examPaperId,
			triggered_by: args.triggeredBy,
			kind: args.kind ?? "initial",
			total_jobs: args.totalJobs ?? 0,
		},
	})
	return { id: batch.id }
}

/**
 * Creates a fresh batch + staged_script chain rooted at `examPaperId`. Use
 * this when a test creates submissions for a paper other than the seeded
 * TEST_EXAM_PAPER_ID — sharing the global TEST_STAGED_SCRIPT_ID across
 * different exam papers technically works (no DB constraint enforces the
 * chain) but breaks any query that walks staged_script → batch → exam_paper.
 *
 * Tear down via `cleanupBatch(batchId)`.
 */
export async function createTestStagedScript(args: {
	examPaperId: string
	uploadedBy: string
}): Promise<{ batchId: string; stagedScriptId: string }> {
	const batch = await createTestBatch(args.examPaperId, args.uploadedBy)
	const staged = await db.stagedScript.create({
		data: {
			batch_job_id: batch.id,
			page_keys: [],
			status: "proposed",
		},
	})
	return { batchId: batch.id, stagedScriptId: staged.id }
}

export async function cleanupBatch(batchId: string) {
	// Submissions are linked to a batch only via staged_script_id now.
	const stagedScriptIds = (
		await db.stagedScript.findMany({
			where: { batch_job_id: batchId },
			select: { id: true },
		})
	).map((s) => s.id)
	const submissions =
		stagedScriptIds.length > 0
			? await db.studentSubmission.findMany({
					where: { staged_script_id: { in: stagedScriptIds } },
					select: { id: true, processing_batch_id: true },
				})
			: []
	const subIds = submissions.map((s) => s.id)
	const processingBatchIds = Array.from(
		new Set(
			submissions
				.map((s) => s.processing_batch_id)
				.filter((v): v is string => v !== null),
		),
	)
	if (subIds.length > 0) {
		// AI annotations cascade-delete with their grading run.
		await db.gradingRun.deleteMany({ where: { submission_id: { in: subIds } } })
		await db.ocrRun.deleteMany({ where: { submission_id: { in: subIds } } })
		await db.studentSubmission.deleteMany({ where: { id: { in: subIds } } })
	}
	await db.stagedScript.deleteMany({ where: { batch_job_id: batchId } })
	if (processingBatchIds.length > 0) {
		// Catches both `initial` PBs (ingest_batch_id = batchId) and the
		// `re_grade` / `re_extract` PBs created by clone paths that don't
		// link back to the ingest batch.
		await db.processingBatch.deleteMany({
			where: { id: { in: processingBatchIds } },
		})
	}
	await db.processingBatch.deleteMany({ where: { ingest_batch_id: batchId } })
	await db.batchIngestJob.delete({ where: { id: batchId } })
}
