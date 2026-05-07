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
	// Delete child runs first (no cascade)
	const submissions = await db.studentSubmission.findMany({
		where: { batch_job_id: batchId },
		select: { id: true },
	})
	const subIds = submissions.map((s) => s.id)
	if (subIds.length > 0) {
		// AI annotations cascade-delete with their grading run.
		await db.gradingRun.deleteMany({ where: { submission_id: { in: subIds } } })
		await db.ocrRun.deleteMany({ where: { submission_id: { in: subIds } } })
	}
	await db.studentSubmission.deleteMany({ where: { batch_job_id: batchId } })
	await db.stagedScript.deleteMany({ where: { batch_job_id: batchId } })
	await db.batchIngestJob.delete({ where: { id: batchId } })
}
