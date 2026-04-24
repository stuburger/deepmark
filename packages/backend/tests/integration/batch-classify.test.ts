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

const Y10_PAPERS = path.resolve(__dirname, "../../../../y10_papers")

beforeAll(async () => {
	await ensureExamPaper()
})

describe("batch-classify Lambda", () => {
	let batchId: string

	afterEach(async () => {
		if (batchId) await cleanupBatch(batchId).catch(() => {})
	})

	async function runBatchAndWait() {
		await sendToQueue(Resource.BatchClassifyQueue.url, {
			batch_job_id: batchId,
		})

		return waitFor(
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
	}

	it("classifies sofia-1.png (single image) as 1 excluded StagedScript", async () => {
		const batch = await createTestBatch(TEST_EXAM_PAPER_ID, TEST_USER_ID)
		batchId = batch.id

		const imgBytes = fs.readFileSync(path.join(Y10_PAPERS, "sofia-1.png"))
		await uploadTestFile(
			`batches/${batchId}/source/sofia-1.png`,
			imgBytes,
			"image/png",
		)

		const result = await runBatchAndWait()

		expect(result.status).toBe("staging")
		expect(result.staged_scripts).toHaveLength(1)
		expect(result.staged_scripts[0]?.status).toBe("excluded")
	})

	it("classifies sofia-1.pdf (3-page single-student PDF) as at least 1 staged script", async () => {
		const batch = await createTestBatch(TEST_EXAM_PAPER_ID, TEST_USER_ID)
		batchId = batch.id

		const pdfBytes = fs.readFileSync(path.join(Y10_PAPERS, "sofia-1.pdf"))
		await uploadTestFile(
			`batches/${batchId}/source/sofia-1.pdf`,
			pdfBytes,
			"application/pdf",
		)

		const result = await runBatchAndWait()

		expect(result.status).toBe("staging")
		expect(result.staged_scripts.length).toBeGreaterThanOrEqual(1)
	})

	it("classifies y10_scanpaper_3.pdf (multi-student PDF) as ≥ 2 staged scripts", async () => {
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

		const result = await runBatchAndWait()

		if (result.status === "failed") console.error("Lambda error:", result.error)
		expect(result.status).toBe("staging")
		expect(result.staged_scripts.length).toBeGreaterThanOrEqual(2)
	})

	it("always lands in staging (no auto-commit path)", async () => {
		const batch = await createTestBatch(TEST_EXAM_PAPER_ID, TEST_USER_ID)
		batchId = batch.id

		const imgBytes = fs.readFileSync(path.join(Y10_PAPERS, "sofia-1.png"))
		await uploadTestFile(
			`batches/${batchId}/source/sofia-1.png`,
			imgBytes,
			"image/png",
		)

		const result = await runBatchAndWait()

		expect(result.status).toBe("staging")
	})
})
