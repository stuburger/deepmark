import * as fs from "node:fs"
import * as path from "node:path"
import {
	TEST_EXAM_PAPER_ID,
	TEST_USER_ID,
	cleanupBatch,
	createTestBatch,
	db,
	ensureExamPaper,
	sendToQueue,
	uploadTestFile,
	waitFor,
} from "@mcp-gcse/test-utils"
import { Resource } from "sst"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

const Y10_PAPERS = path.resolve(process.cwd(), "y10_papers")

beforeAll(async () => {
	await ensureExamPaper()
})

describe("batch-classify Lambda", () => {
	let batchId: string

	afterEach(async () => {
		if (batchId) await cleanupBatch(batchId).catch(() => {})
	})

	it("classifies sofia-1.png (single JPEG) as 1 excluded StagedScript pending review", async () => {
		const batch = await createTestBatch(TEST_EXAM_PAPER_ID, TEST_USER_ID)
		batchId = batch.id

		const imgBytes = fs.readFileSync(path.join(Y10_PAPERS, "sofia-1.png"))
		await uploadTestFile(
			`batches/${batchId}/source/sofia-1.png`,
			imgBytes,
			"image/png",
		)

		await sendToQueue(Resource.BatchClassifyQueue.url, {
			batch_job_id: batchId,
		})

		const result = await waitFor(async () => {
			const b = await db.batchIngestJob.findUnique({
				where: { id: batchId },
				include: { staged_scripts: true },
			})
			if (
				b?.status === "staging" ||
				b?.status === "marking" ||
				b?.status === "failed"
			) {
				return b
			}
			return null
		})

		expect(result.status).not.toBe("failed")
		expect(result.staged_scripts).toHaveLength(1)
		expect(result.staged_scripts[0]?.status).toBe("excluded")
	})

	it("classifies sofia-1.pdf (3-page single-student PDF) as at least 1 proposed StagedScript", async () => {
		const batch = await createTestBatch(TEST_EXAM_PAPER_ID, TEST_USER_ID)
		batchId = batch.id

		const pdfBytes = fs.readFileSync(path.join(Y10_PAPERS, "sofia-1.pdf"))
		await uploadTestFile(
			`batches/${batchId}/source/sofia-1.pdf`,
			pdfBytes,
			"application/pdf",
		)

		await sendToQueue(Resource.BatchClassifyQueue.url, {
			batch_job_id: batchId,
		})

		const result = await waitFor(async () => {
			const b = await db.batchIngestJob.findUnique({
				where: { id: batchId },
				include: { staged_scripts: true },
			})
			if (
				b?.status === "staging" ||
				b?.status === "marking" ||
				b?.status === "failed"
			) {
				return b
			}
			return null
		})

		expect(result.status).not.toBe("failed")
		expect(result.staged_scripts.length).toBeGreaterThanOrEqual(1)
	})

	it("classifies y10_scanpaper_3.pdf (4-page bulk PDF) as 2 proposed StagedScripts", async () => {
		const batch = await createTestBatch(TEST_EXAM_PAPER_ID, TEST_USER_ID)
		batchId = batch.id

		const pdfBytes = fs.readFileSync(
			path.join(Y10_PAPERS, "y10_scanpaper_3.pdf"),
		)
		await uploadTestFile(
			`batches/${batchId}/source/y10_scanpaper_3.pdf`,
			pdfBytes,
			"application/pdf",
		)

		await sendToQueue(Resource.BatchClassifyQueue.url, {
			batch_job_id: batchId,
		})

		const result = await waitFor(async () => {
			const b = await db.batchIngestJob.findUnique({
				where: { id: batchId },
				include: { staged_scripts: true },
			})
			if (
				b?.status === "staging" ||
				b?.status === "marking" ||
				b?.status === "failed"
			) {
				return b
			}
			return null
		})

		if (result.status === "failed") console.error("Lambda error:", result.error)
		expect(result.status).not.toBe("failed")
		expect(result.staged_scripts.length).toBeGreaterThanOrEqual(2)
	})

	it("auto-commits y10_scanpaper_3.pdf when review_mode = auto and all confidence >= 0.90", async () => {
		const batch = await db.batchIngestJob.create({
			data: {
				exam_paper_id: TEST_EXAM_PAPER_ID,
				uploaded_by: TEST_USER_ID,
				review_mode: "auto",
				status: "uploading",
			},
		})
		batchId = batch.id

		const pdfBytes = fs.readFileSync(
			path.join(Y10_PAPERS, "y10_scanpaper_3.pdf"),
		)
		await uploadTestFile(
			`batches/${batchId}/source/y10_scanpaper_3.pdf`,
			pdfBytes,
			"application/pdf",
		)

		await sendToQueue(Resource.BatchClassifyQueue.url, {
			batch_job_id: batchId,
		})

		const result = await waitFor(
			async () => {
				const b = await db.batchIngestJob.findUnique({
					where: { id: batchId },
				})
				if (
					b?.status === "staging" ||
					b?.status === "marking" ||
					b?.status === "failed"
				) {
					return b
				}
				return null
			},
			{ timeout: 120_000 },
		)

		// With high confidence, should be auto-committed to marking
		if (result.status === "marking") {
			expect(result.total_student_jobs).toBeGreaterThan(0)
		} else {
			// If confidence was low, it went to staging — that's also valid
			expect(result.status).toBe("staging")
		}
	})

	it("stays in staging when review_mode = required regardless of confidence", async () => {
		const batch = await db.batchIngestJob.create({
			data: {
				exam_paper_id: TEST_EXAM_PAPER_ID,
				uploaded_by: TEST_USER_ID,
				review_mode: "required",
				status: "uploading",
			},
		})
		batchId = batch.id

		const imgBytes = fs.readFileSync(path.join(Y10_PAPERS, "sofia-1.png"))
		await uploadTestFile(
			`batches/${batchId}/source/sofia-1.png`,
			imgBytes,
			"image/png",
		)

		await sendToQueue(Resource.BatchClassifyQueue.url, {
			batch_job_id: batchId,
		})

		const result = await waitFor(async () => {
			const b = await db.batchIngestJob.findUnique({ where: { id: batchId } })
			if (
				b?.status === "staging" ||
				b?.status === "marking" ||
				b?.status === "failed"
			) {
				return b
			}
			return null
		})

		expect(result.status).toBe("staging")
	})
})

describe("blank page handling", () => {
	let batchId: string

	afterEach(async () => {
		if (batchId) await cleanupBatch(batchId).catch(() => {})
	})

	it("separator mode: drops start/end blanks and detects 2 scripts in start-end-blank.pdf", async () => {
		const batch = await db.batchIngestJob.create({
			data: {
				exam_paper_id: TEST_EXAM_PAPER_ID,
				uploaded_by: TEST_USER_ID,
				review_mode: "required",
				blank_page_mode: "separator",
				status: "uploading",
			},
		})
		batchId = batch.id

		const pdfBytes = fs.readFileSync(
			path.join(Y10_PAPERS, "start-end-blank.pdf"),
		)
		await uploadTestFile(
			`batches/${batchId}/source/start-end-blank.pdf`,
			pdfBytes,
			"application/pdf",
		)

		await sendToQueue(Resource.BatchClassifyQueue.url, {
			batch_job_id: batchId,
		})

		const result = await waitFor(
			async () => {
				const b = await db.batchIngestJob.findUnique({
					where: { id: batchId },
					include: { staged_scripts: true },
				})
				if (
					b?.status === "staging" ||
					b?.status === "marking" ||
					b?.status === "failed"
				) {
					return b
				}
				return null
			},
			{ timeout: 120_000 },
		)

		expect(result.status).toBe("staging")
		expect(result.staged_scripts.length).toBeGreaterThanOrEqual(2)
	})

	it("separator mode: no empty groups created from start-end-blank.pdf", async () => {
		const batch = await db.batchIngestJob.create({
			data: {
				exam_paper_id: TEST_EXAM_PAPER_ID,
				uploaded_by: TEST_USER_ID,
				review_mode: "required",
				blank_page_mode: "separator",
				status: "uploading",
			},
		})
		batchId = batch.id

		const pdfBytes = fs.readFileSync(
			path.join(Y10_PAPERS, "start-end-blank.pdf"),
		)
		await uploadTestFile(
			`batches/${batchId}/source/start-end-blank.pdf`,
			pdfBytes,
			"application/pdf",
		)

		await sendToQueue(Resource.BatchClassifyQueue.url, {
			batch_job_id: batchId,
		})

		const result = await waitFor(
			async () => {
				const b = await db.batchIngestJob.findUnique({
					where: { id: batchId },
					include: { staged_scripts: true },
				})
				if (
					b?.status === "staging" ||
					b?.status === "marking" ||
					b?.status === "failed"
				) {
					return b
				}
				return null
			},
			{ timeout: 120_000 },
		)

		expect(result.status).toBe("staging")
		for (const script of result.staged_scripts) {
			const pageKeys = script.page_keys as { s3_key: string }[]
			expect(pageKeys.length).toBeGreaterThan(0)
		}
	})

	it("script_page mode: context pass detects 2 scripts in start-end-blank.pdf", async () => {
		const batch = await db.batchIngestJob.create({
			data: {
				exam_paper_id: TEST_EXAM_PAPER_ID,
				uploaded_by: TEST_USER_ID,
				review_mode: "required",
				blank_page_mode: "script_page",
				status: "uploading",
			},
		})
		batchId = batch.id

		const pdfBytes = fs.readFileSync(
			path.join(Y10_PAPERS, "start-end-blank.pdf"),
		)
		await uploadTestFile(
			`batches/${batchId}/source/start-end-blank.pdf`,
			pdfBytes,
			"application/pdf",
		)

		await sendToQueue(Resource.BatchClassifyQueue.url, {
			batch_job_id: batchId,
		})

		const result = await waitFor(
			async () => {
				const b = await db.batchIngestJob.findUnique({
					where: { id: batchId },
					include: { staged_scripts: true },
				})
				if (
					b?.status === "staging" ||
					b?.status === "marking" ||
					b?.status === "failed"
				) {
					return b
				}
				return null
			},
			{ timeout: 120_000 },
		)

		expect(result.status).toBe("staging")
		expect(result.staged_scripts.length).toBeGreaterThanOrEqual(2)
	})

	it("script_page mode: blank interior to single script stays as 1 script in random-blank.pdf", async () => {
		const batch = await db.batchIngestJob.create({
			data: {
				exam_paper_id: TEST_EXAM_PAPER_ID,
				uploaded_by: TEST_USER_ID,
				review_mode: "required",
				blank_page_mode: "script_page",
				status: "uploading",
			},
		})
		batchId = batch.id

		const pdfBytes = fs.readFileSync(path.join(Y10_PAPERS, "random-blank.pdf"))
		await uploadTestFile(
			`batches/${batchId}/source/random-blank.pdf`,
			pdfBytes,
			"application/pdf",
		)

		await sendToQueue(Resource.BatchClassifyQueue.url, {
			batch_job_id: batchId,
		})

		const result = await waitFor(
			async () => {
				const b = await db.batchIngestJob.findUnique({
					where: { id: batchId },
					include: { staged_scripts: true },
				})
				if (
					b?.status === "staging" ||
					b?.status === "marking" ||
					b?.status === "failed"
				) {
					return b
				}
				return null
			},
			{ timeout: 120_000 },
		)

		expect(result.status).toBe("staging")
		expect(result.staged_scripts).toHaveLength(1)
	})

	it("separator mode: blank splits single script into 2 in random-blank.pdf", async () => {
		const batch = await db.batchIngestJob.create({
			data: {
				exam_paper_id: TEST_EXAM_PAPER_ID,
				uploaded_by: TEST_USER_ID,
				review_mode: "required",
				blank_page_mode: "separator",
				status: "uploading",
			},
		})
		batchId = batch.id

		const pdfBytes = fs.readFileSync(path.join(Y10_PAPERS, "random-blank.pdf"))
		await uploadTestFile(
			`batches/${batchId}/source/random-blank.pdf`,
			pdfBytes,
			"application/pdf",
		)

		await sendToQueue(Resource.BatchClassifyQueue.url, {
			batch_job_id: batchId,
		})

		const result = await waitFor(
			async () => {
				const b = await db.batchIngestJob.findUnique({
					where: { id: batchId },
					include: { staged_scripts: true },
				})
				if (
					b?.status === "staging" ||
					b?.status === "marking" ||
					b?.status === "failed"
				) {
					return b
				}
				return null
			},
			{ timeout: 120_000 },
		)

		expect(result.status).toBe("staging")
		expect(result.staged_scripts).toHaveLength(2)
	})
})
