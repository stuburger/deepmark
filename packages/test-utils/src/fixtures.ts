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

export async function cleanupBatch(batchId: string) {
	// Delete child runs first (no cascade)
	const submissions = await db.studentSubmission.findMany({
		where: { batch_job_id: batchId },
		select: { id: true },
	})
	const subIds = submissions.map((s) => s.id)
	if (subIds.length > 0) {
		await db.enrichmentRun.deleteMany({ where: { grading_run_id: { in: subIds } } })
		await db.gradingRun.deleteMany({ where: { submission_id: { in: subIds } } })
		await db.ocrRun.deleteMany({ where: { submission_id: { in: subIds } } })
	}
	await db.studentSubmission.deleteMany({ where: { batch_job_id: batchId } })
	await db.stagedScript.deleteMany({ where: { batch_job_id: batchId } })
	await db.batchIngestJob.delete({ where: { id: batchId } })
}
