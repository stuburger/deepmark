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
	await db.studentPaperJob.deleteMany({ where: { batch_job_id: batchId } })
	await db.stagedScript.deleteMany({ where: { batch_job_id: batchId } })
	await db.batchIngestJob.delete({ where: { id: batchId } })
}
