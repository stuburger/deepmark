import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { db } from "./helpers/db"
import { cleanupBatch } from "./helpers/fixtures"
import {
	TEST_EXAM_PAPER_ID,
	TEST_USER_ID,
	ensureExamPaper,
} from "./helpers/seed"

vi.mock("../../packages/backend/src/lib/push-notification", () => ({
	sendBatchCompleteNotification: vi.fn().mockResolvedValue(undefined),
}))

const { checkAndNotifyBatchCompletion } = await import(
	"../../packages/backend/src/processors/student-paper-grade"
)

beforeAll(async () => {
	await ensureExamPaper()
})

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

		const bucketName = "test-bucket"
		await db.studentPaperJob.createMany({
			data: [
				{
					batch_job_id: batch.id,
					exam_paper_id: TEST_EXAM_PAPER_ID,
					uploaded_by: TEST_USER_ID,
					s3_key: `test/${batch.id}/job1`,
					s3_bucket: bucketName,
					exam_board: "AQA",
					status: "ocr_complete",
				},
				{
					batch_job_id: batch.id,
					exam_paper_id: TEST_EXAM_PAPER_ID,
					uploaded_by: TEST_USER_ID,
					s3_key: `test/${batch.id}/job2`,
					s3_bucket: bucketName,
					exam_board: "AQA",
					status: "ocr_complete",
				},
			],
		})

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

		await db.studentPaperJob.create({
			data: {
				batch_job_id: batch.id,
				exam_paper_id: TEST_EXAM_PAPER_ID,
				uploaded_by: TEST_USER_ID,
				s3_key: `test/${batch.id}/job1`,
				s3_bucket: "test-bucket",
				exam_board: "AQA",
				status: "ocr_complete",
			},
		})

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

		await db.studentPaperJob.createMany({
			data: [
				{
					batch_job_id: batch.id,
					exam_paper_id: TEST_EXAM_PAPER_ID,
					uploaded_by: TEST_USER_ID,
					s3_key: `test/${batch.id}/job1`,
					s3_bucket: "test-bucket",
					exam_board: "AQA",
					status: "ocr_complete",
				},
				{
					batch_job_id: batch.id,
					exam_paper_id: TEST_EXAM_PAPER_ID,
					uploaded_by: TEST_USER_ID,
					s3_key: `test/${batch.id}/job2`,
					s3_bucket: "test-bucket",
					exam_board: "AQA",
					status: "grading",
				},
			],
		})

		await checkAndNotifyBatchCompletion(batch.id)

		const updated = await db.batchIngestJob.findUniqueOrThrow({
			where: { id: batch.id },
		})
		expect(updated.status).toBe("marking")
		expect(updated.notification_sent_at).toBeNull()
	})

	it("is idempotent: running twice does not double-notify", async () => {
		const { sendBatchCompleteNotification } = await import(
			"../../packages/backend/src/lib/push-notification"
		)
		const mockFn = vi.mocked(sendBatchCompleteNotification)
		mockFn.mockClear()

		const batch = await db.batchIngestJob.create({
			data: {
				exam_paper_id: TEST_EXAM_PAPER_ID,
				uploaded_by: TEST_USER_ID,
				total_student_jobs: 1,
				status: "marking",
			},
		})
		batchId = batch.id

		await db.studentPaperJob.create({
			data: {
				batch_job_id: batch.id,
				exam_paper_id: TEST_EXAM_PAPER_ID,
				uploaded_by: TEST_USER_ID,
				s3_key: `test/${batch.id}/job1`,
				s3_bucket: "test-bucket",
				exam_board: "AQA",
				status: "ocr_complete",
			},
		})

		await checkAndNotifyBatchCompletion(batch.id)
		await checkAndNotifyBatchCompletion(batch.id)

		expect(mockFn).toHaveBeenCalledTimes(1)
	})
})
