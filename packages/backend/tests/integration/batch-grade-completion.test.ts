import {
	TEST_EXAM_PAPER_ID,
	TEST_STAGED_SCRIPT_ID,
	TEST_USER_ID,
	cleanupBatch,
	createTestProcessingBatch,
	db,
	ensureExamPaper,
} from "@mcp-gcse/test-utils"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { checkAndNotifyBatchCompletion } from "../../src/processors/student-paper-grade"

beforeAll(async () => {
	await ensureExamPaper()
})

type GradingStatus =
	| "complete"
	| "failed"
	| "cancelled"
	| "processing"
	| "pending"

async function createSubmission(args: {
	batchId: string
	processingBatchId: string
	index: number
	ocrStatus: "complete" | "failed" | "pending" | "processing"
	gradingStatus: GradingStatus
}) {
	const sub = await db.studentSubmission.create({
		data: {
			batch_job_id: args.batchId,
			processing_batch_id: args.processingBatchId,
			exam_paper_id: TEST_EXAM_PAPER_ID,
			uploaded_by: TEST_USER_ID,
			s3_key: `test/${args.batchId}/job${args.index}`,
			s3_bucket: "test-bucket",
			exam_board: "AQA",
			pages: [],
			staged_script_id: TEST_STAGED_SCRIPT_ID,
		},
	})
	const ocrRun = await db.ocrRun.create({
		data: { id: sub.id, submission_id: sub.id, status: args.ocrStatus },
	})
	await db.gradingRun.create({
		data: {
			id: sub.id,
			submission_id: sub.id,
			ocr_run_id: ocrRun.id,
			status: args.gradingStatus,
		},
	})
	return sub
}

describe("batch grade completion (ProcessingBatch)", () => {
	let batchId: string | null = null
	let processingBatchId: string | null = null

	afterEach(async () => {
		if (processingBatchId) {
			await db.processingBatch
				.deleteMany({ where: { id: processingBatchId } })
				.catch(() => {})
			processingBatchId = null
		}
		if (batchId) {
			await cleanupBatch(batchId).catch(() => {})
			batchId = null
		}
	})

	async function makeBatch(totalJobs: number, kind: "initial" | "re_grade" = "initial") {
		const batch = await db.batchIngestJob.create({
			data: {
				exam_paper_id: TEST_EXAM_PAPER_ID,
				uploaded_by: TEST_USER_ID,
				status: "uploading",
			},
		})
		batchId = batch.id
		const pb = await createTestProcessingBatch({
			examPaperId: TEST_EXAM_PAPER_ID,
			triggeredBy: TEST_USER_ID,
			kind,
			totalJobs,
		})
		processingBatchId = pb.id
		return { batchId: batch.id, processingBatchId: pb.id }
	}

	it("marks complete and emits when every grading run is terminal", async () => {
		const { batchId, processingBatchId } = await makeBatch(2)

		await createSubmission({
			batchId,
			processingBatchId,
			index: 1,
			ocrStatus: "complete",
			gradingStatus: "complete",
		})
		await createSubmission({
			batchId,
			processingBatchId,
			index: 2,
			ocrStatus: "complete",
			gradingStatus: "complete",
		})

		await checkAndNotifyBatchCompletion(processingBatchId)

		const updated = await db.processingBatch.findUniqueOrThrow({
			where: { id: processingBatchId },
		})
		expect(updated.status).toBe("complete")
		expect(updated.notification_sent_at).not.toBeNull()
		expect(updated.completed_at).not.toBeNull()
	})

	it("settles a batch where one OCR job permanently failed", async () => {
		const { batchId, processingBatchId } = await makeBatch(3)

		await createSubmission({
			batchId,
			processingBatchId,
			index: 1,
			ocrStatus: "complete",
			gradingStatus: "complete",
		})
		await createSubmission({
			batchId,
			processingBatchId,
			index: 2,
			ocrStatus: "complete",
			gradingStatus: "complete",
		})
		// OCR-DLQ-failed job: ocr=failed, grading still pending (will never run).
		await createSubmission({
			batchId,
			processingBatchId,
			index: 3,
			ocrStatus: "failed",
			gradingStatus: "pending",
		})

		await checkAndNotifyBatchCompletion(processingBatchId)

		const updated = await db.processingBatch.findUniqueOrThrow({
			where: { id: processingBatchId },
		})
		expect(updated.status).toBe("complete")
		expect(updated.notification_sent_at).not.toBeNull()
	})

	it("marks the batch failed when every job terminated with failure", async () => {
		const { batchId, processingBatchId } = await makeBatch(2)

		await createSubmission({
			batchId,
			processingBatchId,
			index: 1,
			ocrStatus: "failed",
			gradingStatus: "pending",
		})
		await createSubmission({
			batchId,
			processingBatchId,
			index: 2,
			ocrStatus: "complete",
			gradingStatus: "failed",
		})

		await checkAndNotifyBatchCompletion(processingBatchId)

		const updated = await db.processingBatch.findUniqueOrThrow({
			where: { id: processingBatchId },
		})
		expect(updated.status).toBe("failed")
		expect(updated.notification_sent_at).not.toBeNull()
	})

	it("is idempotent — notification_sent_at fixes on first call", async () => {
		const { batchId, processingBatchId } = await makeBatch(1)

		await createSubmission({
			batchId,
			processingBatchId,
			index: 1,
			ocrStatus: "complete",
			gradingStatus: "complete",
		})

		await checkAndNotifyBatchCompletion(processingBatchId)
		const first = await db.processingBatch.findUniqueOrThrow({
			where: { id: processingBatchId },
		})

		await checkAndNotifyBatchCompletion(processingBatchId)
		const second = await db.processingBatch.findUniqueOrThrow({
			where: { id: processingBatchId },
		})

		expect(second.notification_sent_at).toEqual(first.notification_sent_at)
		expect(second.completed_at).toEqual(first.completed_at)
	})

	it("does not complete while jobs are still in flight", async () => {
		const { batchId, processingBatchId } = await makeBatch(2)

		await createSubmission({
			batchId,
			processingBatchId,
			index: 1,
			ocrStatus: "complete",
			gradingStatus: "complete",
		})
		await createSubmission({
			batchId,
			processingBatchId,
			index: 2,
			ocrStatus: "complete",
			gradingStatus: "processing",
		})

		await checkAndNotifyBatchCompletion(processingBatchId)

		const updated = await db.processingBatch.findUniqueOrThrow({
			where: { id: processingBatchId },
		})
		expect(updated.status).toBe("pending")
		expect(updated.notification_sent_at).toBeNull()
	})

	it("treats kind=re_grade the same way for the completion mechanics", async () => {
		const { batchId, processingBatchId } = await makeBatch(1, "re_grade")

		await createSubmission({
			batchId,
			processingBatchId,
			index: 1,
			ocrStatus: "complete",
			gradingStatus: "complete",
		})

		await checkAndNotifyBatchCompletion(processingBatchId)

		const updated = await db.processingBatch.findUniqueOrThrow({
			where: { id: processingBatchId },
		})
		expect(updated.kind).toBe("re_grade")
		expect(updated.status).toBe("complete")
		expect(updated.notification_sent_at).not.toBeNull()
	})
})
