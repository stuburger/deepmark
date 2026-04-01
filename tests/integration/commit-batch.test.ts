import * as fs from "node:fs"
import * as path from "node:path"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { db } from "./helpers/db"
import { cleanupBatch } from "./helpers/fixtures"
import { uploadTestFile } from "./helpers/s3"
import {
	TEST_EXAM_PAPER_ID,
	TEST_USER_ID,
	ensureExamPaper,
} from "./helpers/seed"

const Y10_PAPERS = path.resolve(process.cwd(), "y10_papers")

// Direct import of the service function — bypasses Next.js server action wrapper
const { commitBatchService } = await import(
	"../../apps/web/src/lib/batch-actions"
)

beforeAll(async () => {
	await ensureExamPaper()
})

describe("commitBatch", () => {
	let batchId: string

	afterEach(async () => {
		if (batchId) await cleanupBatch(batchId).catch(() => {})
	})

	it("creates 1 StudentPaperJob from 1 confirmed StagedScript", async () => {
		const batch = await db.batchIngestJob.create({
			data: {
				exam_paper_id: TEST_EXAM_PAPER_ID,
				uploaded_by: TEST_USER_ID,
				status: "staging",
			},
		})
		batchId = batch.id

		const pdfBytes = fs.readFileSync(path.join(Y10_PAPERS, "sofia-1.pdf"))
		const key = await uploadTestFile(
			`batches/${batchId}/source/sofia-1.pdf`,
			pdfBytes,
			"application/pdf",
		)

		await db.stagedScript.create({
			data: {
				batch_job_id: batchId,
				page_keys: [
					{
						s3_key: key,
						order: 1,
						mime_type: "application/pdf",
						source_file: key,
					},
				],
				proposed_name: "Sofia",
				confirmed_name: "Sofia",
				confidence: 0.95,
				status: "confirmed",
			},
		})

		const result = await commitBatchService(batchId, TEST_USER_ID)

		expect(result.ok).toBe(true)
		if (!result.ok) return

		expect(result.studentJobCount).toBe(1)

		const jobs = await db.studentPaperJob.findMany({
			where: { batch_job_id: batchId },
		})
		expect(jobs).toHaveLength(1)
		expect(jobs[0]!.student_name).toBe("Sofia")
		expect(jobs[0]!.batch_job_id).toBe(batchId)
	})

	it("creates 2 StudentPaperJobs from 2 confirmed StagedScripts", async () => {
		const batch = await db.batchIngestJob.create({
			data: {
				exam_paper_id: TEST_EXAM_PAPER_ID,
				uploaded_by: TEST_USER_ID,
				status: "staging",
			},
		})
		batchId = batch.id

		const pdfBytes = fs.readFileSync(
			path.join(Y10_PAPERS, "y10_scanpaper_3.pdf"),
		)

		const key1 = await uploadTestFile(
			`batches/${batchId}/source/page-001.pdf`,
			pdfBytes,
			"application/pdf",
		)
		const key2 = await uploadTestFile(
			`batches/${batchId}/source/page-002.pdf`,
			pdfBytes,
			"application/pdf",
		)

		await db.stagedScript.createMany({
			data: [
				{
					batch_job_id: batchId,
					page_keys: [
						{
							s3_key: key1,
							order: 1,
							mime_type: "application/pdf",
							source_file: key1,
						},
					],
					proposed_name: "Student A",
					confirmed_name: "Student A",
					confidence: 0.92,
					status: "confirmed",
				},
				{
					batch_job_id: batchId,
					page_keys: [
						{
							s3_key: key2,
							order: 1,
							mime_type: "application/pdf",
							source_file: key2,
						},
					],
					proposed_name: "Student B",
					confirmed_name: "Student B",
					confidence: 0.91,
					status: "confirmed",
				},
			],
		})

		const result = await commitBatchService(batchId, TEST_USER_ID)

		expect(result.ok).toBe(true)
		if (!result.ok) return

		expect(result.studentJobCount).toBe(2)

		const jobs = await db.studentPaperJob.findMany({
			where: { batch_job_id: batchId },
		})
		expect(jobs).toHaveLength(2)
	})

	it("sets total_student_jobs = N on BatchIngestJob", async () => {
		const batch = await db.batchIngestJob.create({
			data: {
				exam_paper_id: TEST_EXAM_PAPER_ID,
				uploaded_by: TEST_USER_ID,
				status: "staging",
			},
		})
		batchId = batch.id

		const pdfBytes = fs.readFileSync(path.join(Y10_PAPERS, "sofia-1.pdf"))
		const key = await uploadTestFile(
			`batches/${batchId}/source/sofia-1.pdf`,
			pdfBytes,
			"application/pdf",
		)

		await db.stagedScript.create({
			data: {
				batch_job_id: batchId,
				page_keys: [
					{
						s3_key: key,
						order: 1,
						mime_type: "application/pdf",
						source_file: key,
					},
				],
				proposed_name: "Sofia",
				confirmed_name: "Sofia",
				confidence: 0.95,
				status: "confirmed",
			},
		})

		await commitBatchService(batchId, TEST_USER_ID)

		const updated = await db.batchIngestJob.findUniqueOrThrow({
			where: { id: batchId },
		})
		expect(updated.total_student_jobs).toBe(1)
		expect(updated.status).toBe("marking")
	})

	it("each StudentPaperJob.pages uses {key, order, mime_type} mapped from StagedScript.page_keys", async () => {
		const batch = await db.batchIngestJob.create({
			data: {
				exam_paper_id: TEST_EXAM_PAPER_ID,
				uploaded_by: TEST_USER_ID,
				status: "staging",
			},
		})
		batchId = batch.id

		const pdfBytes = fs.readFileSync(path.join(Y10_PAPERS, "sofia-1.pdf"))
		const key = await uploadTestFile(
			`batches/${batchId}/source/sofia-1.pdf`,
			pdfBytes,
			"application/pdf",
		)

		await db.stagedScript.create({
			data: {
				batch_job_id: batchId,
				page_keys: [
					{
						s3_key: key,
						order: 1,
						mime_type: "application/pdf",
						source_file: key,
					},
				],
				proposed_name: "Sofia",
				confirmed_name: "Sofia",
				confidence: 0.95,
				status: "confirmed",
			},
		})

		await commitBatchService(batchId, TEST_USER_ID)

		const jobs = await db.studentPaperJob.findMany({
			where: { batch_job_id: batchId },
		})
		expect(jobs).toHaveLength(1)
		expect(jobs[0]!.pages).toEqual([
			{ key, order: 1, mime_type: "application/pdf" },
		])
	})

	it("rejects commit if any StagedScript is still in proposed status", async () => {
		const batch = await db.batchIngestJob.create({
			data: {
				exam_paper_id: TEST_EXAM_PAPER_ID,
				uploaded_by: TEST_USER_ID,
				status: "staging",
			},
		})
		batchId = batch.id

		const pdfBytes = fs.readFileSync(path.join(Y10_PAPERS, "sofia-1.pdf"))
		const key = await uploadTestFile(
			`batches/${batchId}/source/sofia-1.pdf`,
			pdfBytes,
			"application/pdf",
		)

		await db.stagedScript.createMany({
			data: [
				{
					batch_job_id: batchId,
					page_keys: [
						{
							s3_key: key,
							order: 1,
							mime_type: "application/pdf",
							source_file: key,
						},
					],
					proposed_name: "Sofia",
					confirmed_name: "Sofia",
					confidence: 0.95,
					status: "confirmed",
				},
				{
					batch_job_id: batchId,
					page_keys: [
						{
							s3_key: key,
							order: 1,
							mime_type: "application/pdf",
							source_file: key,
						},
					],
					proposed_name: "Unknown",
					confidence: 0.4,
					status: "proposed",
				},
			],
		})

		const result = await commitBatchService(batchId, TEST_USER_ID)

		expect(result.ok).toBe(false)
		if (result.ok) return

		expect(result.error).toMatch(/still need review/i)

		const jobs = await db.studentPaperJob.findMany({
			where: { batch_job_id: batchId },
		})
		expect(jobs).toHaveLength(0)
	})
})
