import {
	TEST_EXAM_PAPER_ID,
	TEST_USER_ID,
	cleanupBatch,
	db,
	ensureExamPaper,
} from "@mcp-gcse/test-utils"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { checkAndNotifyBatchCompletion } from "../../src/processors/student-paper-grade"

beforeAll(async () => {
	await ensureExamPaper()
})

/** Helper: create a submission + grading run with a given status */
async function createSubmissionWithGrading(
	batchId: string,
	index: number,
	gradingStatus:
		| "complete"
		| "failed"
		| "cancelled"
		| "processing"
		| "pending",
) {
	const sub = await db.studentSubmission.create({
		data: {
			batch_job_id: batchId,
			exam_paper_id: TEST_EXAM_PAPER_ID,
			uploaded_by: TEST_USER_ID,
			s3_key: `test/${batchId}/job${index}`,
			s3_bucket: "test-bucket",
			exam_board: "AQA",
			pages: [],
		},
	})
	const ocrRun = await db.ocrRun.create({
		data: { id: sub.id, submission_id: sub.id, status: "complete" },
	})
	await db.gradingRun.create({
		data: {
			id: sub.id,
			submission_id: sub.id,
			ocr_run_id: ocrRun.id,
			status: gradingStatus,
		},
	})
	return sub
}

describe("batch grade completion", () => {
	let batchId: string

	afterEach(async () => {
		if (batchId) await cleanupBatch(batchId).catch(() => {})
	})

	it("sets batch status to complete when all child jobs are terminal", async () => {
		const batch = await db.batchIngestJob.create({
			data: {
				exam_paper_id: TEST_EXAM_PAPER_ID,
				uploaded_by: TEST_USER_ID,
				total_student_jobs: 2,
				status: "marking",
			},
		})
		batchId = batch.id

		await createSubmissionWithGrading(batch.id, 1, "complete")
		await createSubmissionWithGrading(batch.id, 2, "complete")

		await checkAndNotifyBatchCompletion(batch.id)

		const updated = await db.batchIngestJob.findUniqueOrThrow({
			where: { id: batch.id },
		})
		expect(updated.status).toBe("complete")
		expect(updated.notification_sent_at).not.toBeNull()
	})

	it("sets notification_sent_at exactly once", async () => {
		const batch = await db.batchIngestJob.create({
			data: {
				exam_paper_id: TEST_EXAM_PAPER_ID,
				uploaded_by: TEST_USER_ID,
				total_student_jobs: 1,
				status: "marking",
			},
		})
		batchId = batch.id

		await createSubmissionWithGrading(batch.id, 1, "complete")

		await checkAndNotifyBatchCompletion(batch.id)
		const first = await db.batchIngestJob.findUniqueOrThrow({
			where: { id: batch.id },
		})

		await checkAndNotifyBatchCompletion(batch.id)
		const second = await db.batchIngestJob.findUniqueOrThrow({
			where: { id: batch.id },
		})

		expect(second.notification_sent_at).toEqual(first.notification_sent_at)
	})

	it("does not complete when only some child jobs are terminal", async () => {
		const batch = await db.batchIngestJob.create({
			data: {
				exam_paper_id: TEST_EXAM_PAPER_ID,
				uploaded_by: TEST_USER_ID,
				total_student_jobs: 2,
				status: "marking",
			},
		})
		batchId = batch.id

		await createSubmissionWithGrading(batch.id, 1, "complete")
		await createSubmissionWithGrading(batch.id, 2, "processing")

		await checkAndNotifyBatchCompletion(batch.id)

		const updated = await db.batchIngestJob.findUniqueOrThrow({
			where: { id: batch.id },
		})
		expect(updated.status).toBe("marking")
		expect(updated.notification_sent_at).toBeNull()
	})

})
