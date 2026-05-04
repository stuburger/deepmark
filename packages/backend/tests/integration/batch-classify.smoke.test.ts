import * as fs from "node:fs"
import * as path from "node:path"
import {
	TEST_EXAM_PAPER_ID,
	TEST_USER_ID,
	cleanupBatch,
	createTestBatch,
	db,
	ensureExamPaper,
	invokeLambdaWithSqsBody,
	uploadTestFile,
} from "@mcp-gcse/test-utils"
import { Resource } from "sst"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

const Y10_PAPERS = path.resolve(__dirname, "../../../../y10_papers")
const FIXTURE = "gwaugh-700-page.pdf"

beforeAll(async () => {
	await ensureExamPaper()
})

// Smoke test against a real deployed Lambda with the GWAUGH 700-page fixture
// — the same upload that pinned production in an OOM retry-loop on 2026-05-04.
//
// Caveat: this test is green-before-fix. The 1 GB → 2 GB memory bump alone
// gives the unbounded `Promise.all` in pdf-pages.ts:49 / segment-script.ts:53
// enough headroom to complete this fixture (peak Max Memory Used was 1724 MB
// at 2 GB cap — 84% utilisation, thin margin). After bounded concurrency
// lands, peak should drop to ~500 MB. CloudWatch is the witness for that
// regression — there's no second fixture sized to red the unbounded fan-out
// at 2 GB (deliberately skipped to keep test cost down).
describe("batch-classify smoke (deployed Lambda, GWAUGH 700-page fixture)", () => {
	let batchId: string

	afterEach(async () => {
		if (batchId) await cleanupBatch(batchId).catch(() => {})
	})

	it("processes the GWAUGH 700-page PDF without OOM/timeout", async () => {
		const fixturePath = path.join(Y10_PAPERS, FIXTURE)
		if (!fs.existsSync(fixturePath)) {
			throw new Error(
				`Missing fixture at ${fixturePath}. Re-fetch from S3: aws s3 cp s3://deepmark-production-scansbucketbucket-oxttmuus/batches/cmorezqfn000302lb6v5rkn62/source/GWAUGH\\ Exams.pdf y10_papers/${FIXTURE}`,
			)
		}

		const batch = await createTestBatch(TEST_EXAM_PAPER_ID, TEST_USER_ID)
		batchId = batch.id

		const pdfBytes = fs.readFileSync(fixturePath)
		await uploadTestFile(
			`batches/${batchId}/source/${FIXTURE}`,
			pdfBytes,
			"application/pdf",
		)

		const result = await invokeLambdaWithSqsBody(
			Resource.BatchClassifyTestRunner.name,
			{ batch_job_id: batchId },
		)

		if (result.functionError) {
			console.error("Lambda functionError:", result.functionError)
			console.error("Lambda payload:", result.payload)
			console.error("Lambda log tail:\n", result.logTail)
		}

		expect(result.functionError).toBeUndefined()
		expect(result.statusCode).toBe(200)

		const final = await db.batchIngestJob.findUnique({
			where: { id: batchId },
			include: { staged_scripts: true },
		})

		if (final?.status === "failed") {
			console.error("Batch row marked failed by handler:", final.error)
		}
		expect(final?.status).toBe("staging")

		// GWAUGH: 700 pages / ~28 per script = ~25 scripts. Allow segmentation
		// jitter (the model occasionally splits/merges adjacent scripts).
		expect(final?.staged_scripts.length).toBeGreaterThanOrEqual(20)
		expect(final?.staged_scripts.length).toBeLessThanOrEqual(35)
	})
})
