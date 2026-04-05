import { db } from "@/db"
import {
	callClassifyBlankPage,
	callClassifyPageBoundary,
	callExtractNameFromPage,
} from "@/lib/batch/classify-calls"
import { extractPdfPages, fetchS3Bytes } from "@/lib/batch/pdf-pages"
import type { PageData, PageGroup, StagedScriptData } from "@/lib/batch/types"
import { logger } from "@/lib/logger"
import { s3 } from "@/lib/s3"
import type { SqsEvent, SqsRecord } from "@/lib/sqs-job-runner"
import { ListObjectsV2Command } from "@aws-sdk/client-s3"
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs"
import type {
	BatchStatus,
	BlankPageMode,
	ClassificationMode,
	StagedScriptStatus,
} from "@mcp-gcse/db"
import { Resource } from "sst"

const TAG = "batch-classify"
const sqs = new SQSClient({})
const AUTO_COMMIT_THRESHOLD = 0.9

type PageKey = {
	s3_key: string
	order: number
	mime_type: string
	source_file: string
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function handler(
	event: SqsEvent,
): Promise<{ batchItemFailures?: { itemIdentifier: string }[] }> {
	const failures: { itemIdentifier: string }[] = []

	for (const record of event.Records) {
		const batchJobId = parseBatchJobId(record)
		if (!batchJobId) continue

		try {
			await classifyBatch(batchJobId)
		} catch (err) {
			const errMsg =
				err instanceof Error
					? `${err.message}\n${err.stack ?? ""}`
					: String(err)
			logger.error(TAG, "Batch classification failed", {
				batchJobId,
				error: errMsg,
			})
			await db.batchIngestJob
				.update({
					where: { id: batchJobId },
					data: {
						status: "failed" as BatchStatus,
						error: err instanceof Error ? err.message : String(err),
					},
				})
				.catch(() => {})
			failures.push({ itemIdentifier: record.messageId })
		}
	}

	return failures.length > 0 ? { batchItemFailures: failures } : {}
}

function parseBatchJobId(record: SqsRecord): string | null {
	const body = JSON.parse(record.body) as { batch_job_id?: string }
	if (!body.batch_job_id) {
		logger.warn(TAG, "Message missing batch_job_id", {
			messageId: record.messageId,
		})
		return null
	}
	return body.batch_job_id
}

// ─── Core classification logic ────────────────────────────────────────────────

async function classifyBatch(batchJobId: string): Promise<void> {
	logger.info(TAG, "Starting batch classification", { batchJobId })

	const batch = await db.batchIngestJob.findUniqueOrThrow({
		where: { id: batchJobId },
		select: {
			id: true,
			review_mode: true,
			blank_page_mode: true,
			pages_per_script: true,
			classification_mode: true,
			exam_paper: {
				select: {
					id: true,
					title: true,
					exam_board: true,
					subject: true,
					year: true,
				},
			},
		},
	})

	await db.batchIngestJob.update({
		where: { id: batchJobId },
		data: { status: "classifying" as BatchStatus },
	})

	const sourceKeys = await listSourceFiles(batchJobId)
	logger.info(TAG, "Source files found", {
		batchJobId,
		count: sourceKeys.length,
		classificationMode: batch.classification_mode,
	})

	const allStagedScripts: StagedScriptData[] = []
	let totalPages = 0

	if (batch.classification_mode === ("per_file" as ClassificationMode)) {
		for (const sourceKey of sourceKeys) {
			const { scripts, pageCount } = await processSourceFilePerFile(
				batchJobId,
				sourceKey,
				batch.pages_per_script,
			)
			allStagedScripts.push(...scripts)
			totalPages += pageCount
		}

		await db.stagedScript.createMany({
			data: allStagedScripts.map((s) => ({
				batch_job_id: batchJobId,
				page_keys: s.page_keys,
				proposed_name: s.proposed_name,
				confidence: s.confidence,
				status: "excluded" as StagedScriptStatus,
			})),
		})

		const hasOversized = allStagedScripts.some((s) => s.hasUncertainPage)
		const shouldAutoCommit =
			batch.review_mode === "auto" &&
			allStagedScripts.length > 0 &&
			!hasOversized

		if (shouldAutoCommit) {
			logger.info(TAG, "Auto-committing per_file batch", {
				batchJobId,
				scriptCount: allStagedScripts.length,
			})
			await autoCommitBatch(batchJobId, batch.exam_paper)
		} else {
			await db.batchIngestJob.update({
				where: { id: batchJobId },
				data: { status: "staging" as BatchStatus },
			})
		}
	} else {
		for (const sourceKey of sourceKeys) {
			const { scripts, pageCount } = await processSourceFile(
				batchJobId,
				sourceKey,
				batch.blank_page_mode,
			)
			allStagedScripts.push(...scripts)
			totalPages += pageCount
		}

		await db.stagedScript.createMany({
			data: allStagedScripts.map((s) => ({
				batch_job_id: batchJobId,
				page_keys: s.page_keys,
				proposed_name: s.proposed_name,
				confidence: s.confidence,
				status: "excluded" as StagedScriptStatus,
			})),
		})

		const hasUncertainPages = allStagedScripts.some((s) => s.hasUncertainPage)

		const shouldAutoCommit =
			batch.review_mode === "auto" &&
			allStagedScripts.length > 0 &&
			allStagedScripts.every((s) => s.confidence >= AUTO_COMMIT_THRESHOLD) &&
			!hasUncertainPages &&
			scriptCountIsPlausible(
				allStagedScripts.length,
				batch.pages_per_script,
				totalPages,
			)

		if (shouldAutoCommit) {
			logger.info(TAG, "Auto-committing batch", {
				batchJobId,
				scriptCount: allStagedScripts.length,
			})
			await autoCommitBatch(batchJobId, batch.exam_paper)
		} else {
			await db.batchIngestJob.update({
				where: { id: batchJobId },
				data: { status: "staging" as BatchStatus },
			})
		}
	}

	logger.info(TAG, "Batch classification complete", {
		batchJobId,
		scriptCount: allStagedScripts.length,
		classificationMode: batch.classification_mode,
	})
}

async function listSourceFiles(batchJobId: string): Promise<string[]> {
	const prefix = `batches/${batchJobId}/source/`
	const result = await s3.send(
		new ListObjectsV2Command({
			Bucket: Resource.ScansBucket.name,
			Prefix: prefix,
		}),
	)
	return (result.Contents ?? [])
		.map((obj) => obj.Key!)
		.filter(Boolean)
		.sort()
}

// ─── Per-file processing ──────────────────────────────────────────────────────

async function processSourceFile(
	batchJobId: string,
	sourceKey: string,
	blankPageMode: BlankPageMode,
): Promise<{ scripts: StagedScriptData[]; pageCount: number }> {
	const mime = guessMime(sourceKey)

	if (mime !== "application/pdf") {
		return {
			scripts: [
				{
					page_keys: [
						{
							s3_key: sourceKey,
							order: 1,
							mime_type: mime,
							source_file: sourceKey,
						},
					],
					proposed_name: null,
					confidence: 1.0,
					hasUncertainPage: false,
				},
			],
			pageCount: 1,
		}
	}

	const pdfBytes = await fetchS3Bytes(Resource.ScansBucket.name, sourceKey)
	const pages = await extractPdfPages(pdfBytes, batchJobId, sourceKey)

	if (pages.length === 0) {
		return { scripts: [], pageCount: 0 }
	}

	const blankIndices = new Set(
		pages.filter((p) => p.jpegBuffer === null).map((p) => p.absoluteIndex),
	)
	const nonBlankIndices = pages
		.filter((p) => p.jpegBuffer !== null)
		.map((p) => p.absoluteIndex)

	logger.info(TAG, "Blank detection complete", {
		total: pages.length,
		blank: blankIndices.size,
	})

	let groups: PageGroup[]
	if (blankPageMode === "separator") {
		groups = classifyBoundariesSeparatorMode(pages, blankIndices)
	} else {
		groups = await classifyBoundariesScriptPageMode(
			pages,
			blankIndices,
			nonBlankIndices,
		)
	}

	await extractNames(groups)

	const scripts: StagedScriptData[] = groups
		.map((g) => {
			const contentPages = g.pages.filter((p) => p.jpegKey !== null)
			return {
				page_keys: contentPages.map((p, i) => ({
					s3_key: p.jpegKey!,
					order: i + 1,
					mime_type: "image/jpeg",
					source_file: sourceKey,
				})),
				proposed_name: g.proposedName,
				confidence: g.confidence,
				hasUncertainPage: g.hasUncertainPage,
			}
		})
		.filter((s) => s.page_keys.length > 0)

	return { scripts, pageCount: pages.length }
}

// ─── Per-file mode: one StagedScript per source file, no Gemini calls ────────

/**
 * In per_file mode the user asserts that each uploaded file is a single
 * student's script. We still extract PDF pages to JPEGs (so the staging
 * preview and OCR pipeline work), but skip all boundary classification.
 *
 * An oversized script (page count > pages_per_script * 2) sets
 * hasUncertainPage=true, which forces staging so the teacher can split it.
 */
async function processSourceFilePerFile(
	batchJobId: string,
	sourceKey: string,
	pagesPerScript: number,
): Promise<{ scripts: StagedScriptData[]; pageCount: number }> {
	const mime = guessMime(sourceKey)

	if (mime !== "application/pdf") {
		return {
			scripts: [
				{
					page_keys: [
						{
							s3_key: sourceKey,
							order: 1,
							mime_type: mime,
							source_file: sourceKey,
						},
					],
					proposed_name: null,
					confidence: 1.0,
					hasUncertainPage: false,
				},
			],
			pageCount: 1,
		}
	}

	const pdfBytes = await fetchS3Bytes(Resource.ScansBucket.name, sourceKey)
	const pages = await extractPdfPages(pdfBytes, batchJobId, sourceKey)

	const contentPages = pages.filter((p) => p.jpegKey !== null)

	if (contentPages.length === 0) {
		return { scripts: [], pageCount: pages.length }
	}

	const isOversized = contentPages.length > pagesPerScript * 2

	const script: StagedScriptData = {
		page_keys: contentPages.map((p, i) => ({
			s3_key: p.jpegKey!,
			order: i + 1,
			mime_type: "image/jpeg",
			source_file: sourceKey,
		})),
		proposed_name: null,
		confidence: 1.0,
		hasUncertainPage: isOversized,
	}

	if (isOversized) {
		logger.warn(TAG, "Oversized script detected in per_file mode", {
			batchJobId,
			sourceKey,
			pageCount: contentPages.length,
			pagesPerScript,
		})
	}

	return { scripts: [script], pageCount: pages.length }
}

// ─── Separator mode: split on blank pages ─────────────────────────────────────

function classifyBoundariesSeparatorMode(
	pages: PageData[],
	blankIndices: Set<number>,
): PageGroup[] {
	const groups: PageGroup[] = []
	let currentPages: PageData[] = []

	for (const page of pages) {
		if (blankIndices.has(page.absoluteIndex)) {
			if (currentPages.length > 0) {
				groups.push({
					pages: currentPages,
					proposedName: null,
					confidence: 0.95,
					hasUncertainPage: false,
				})
				currentPages = []
			}
		} else {
			currentPages.push(page)
		}
	}

	if (currentPages.length > 0) {
		groups.push({
			pages: currentPages,
			proposedName: null,
			confidence: 0.95,
			hasUncertainPage: false,
		})
	}

	return groups
}

// ─── Script-page mode: per-page binary boundary classifier (fan-out/fan-in) ───

async function classifyBoundariesScriptPageMode(
	pages: PageData[],
	blankIndices: Set<number>,
	nonBlankIndices: number[],
): Promise<PageGroup[]> {
	type BoundaryResult = {
		absoluteIndex: number
		isScriptStart: boolean | null
		confidence: number
	}

	type BlankResult = {
		absoluteIndex: number
		classification: "separator" | "script_page" | "artifact"
	}

	// Fan-out 1: boundary classification for non-blank pages (skip index 0)
	const boundaryInputs = nonBlankIndices
		.filter((idx) => idx > 0)
		.map((idx) => {
			// Use the nearest non-blank previous page for context
			const prevNonBlankIdx = nonBlankIndices.filter((i) => i < idx).pop()
			const prevPage =
				prevNonBlankIdx !== undefined ? (pages[prevNonBlankIdx] ?? null) : null
			return {
				absoluteIndex: idx,
				prevPage,
				currentPage: pages[idx]!,
			}
		})

	// Fan-out 2: blank page 3-context classification
	const blankInputs = [...blankIndices]
		.sort((a, b) => a - b)
		.map((idx) => {
			const prevNonBlankIdx = nonBlankIndices.filter((i) => i < idx).pop()
			const nextNonBlankIdx = nonBlankIndices.find((i) => i > idx)
			return {
				absoluteIndex: idx,
				prevPage:
					prevNonBlankIdx !== undefined
						? (pages[prevNonBlankIdx] ?? null)
						: null,
				nextPage:
					nextNonBlankIdx !== undefined
						? (pages[nextNonBlankIdx] ?? null)
						: null,
			}
		})

	const [boundaryResults, blankResults] = await Promise.all([
		runBatch(
			boundaryInputs,
			async ({ absoluteIndex, prevPage, currentPage }) => {
				const result = await callClassifyPageBoundary(prevPage, currentPage)
				return { absoluteIndex, ...result } satisfies BoundaryResult
			},
			10,
		),
		runBatch(
			blankInputs,
			async ({ absoluteIndex, prevPage, nextPage }) => {
				const classification = await callClassifyBlankPage(prevPage, nextPage)
				return { absoluteIndex, classification } satisfies BlankResult
			},
			10,
		),
	])

	const boundaryMap = new Map(boundaryResults.map((r) => [r.absoluteIndex, r]))
	const blankMap = new Map(blankResults.map((r) => [r.absoluteIndex, r]))

	// Fan-in: walk all pages and build groups
	const groups: PageGroup[] = []
	let currentPages: PageData[] = []
	let currentConfidences: number[] = []
	let hasUncertain = false
	let firstNonBlankSeen = false

	function finalizeGroup() {
		if (currentPages.length === 0) return
		const confidence =
			currentConfidences.length > 0
				? currentConfidences.reduce((a, b) => a + b, 0) /
					currentConfidences.length
				: 0.5
		groups.push({
			pages: currentPages,
			proposedName: null,
			confidence,
			hasUncertainPage: hasUncertain,
		})
		currentPages = []
		currentConfidences = []
		hasUncertain = false
	}

	for (const page of pages) {
		const idx = page.absoluteIndex

		if (blankIndices.has(idx)) {
			const blankResult = blankMap.get(idx)
			const classification = blankResult?.classification ?? "artifact"

			if (classification === "separator") {
				finalizeGroup()
			} else if (classification === "script_page") {
				currentPages.push(page)
				currentConfidences.push(0.7)
			}
			// artifact: skip
		} else {
			if (!firstNonBlankSeen) {
				firstNonBlankSeen = true
				currentPages.push(page)
				currentConfidences.push(1.0)
			} else {
				const result = boundaryMap.get(idx)
				const isStart = result?.isScriptStart ?? null
				const confidence = result?.confidence ?? 0.0

				if (isStart === true) {
					finalizeGroup()
					currentPages.push(page)
					currentConfidences.push(confidence)
				} else if (isStart === false) {
					currentPages.push(page)
					currentConfidences.push(confidence)
				} else {
					currentPages.push(page)
					currentConfidences.push(confidence)
					hasUncertain = true
				}
			}
		}
	}

	finalizeGroup()

	return groups
}

// ─── Name extraction ──────────────────────────────────────────────────────────

async function extractNames(groups: PageGroup[]): Promise<void> {
	const results = await runBatch(
		groups,
		async (group) => {
			const firstPage = group.pages.find((p) => p.jpegBuffer !== null)
			if (!firstPage?.jpegBuffer) return { name: null, confidence: 0.0 }
			return callExtractNameFromPage(firstPage.jpegBuffer)
		},
		10,
	)

	for (let i = 0; i < groups.length; i++) {
		groups[i]!.proposedName = results[i]?.name ?? null
	}
}

// ─── Auto-commit ──────────────────────────────────────────────────────────────

async function autoCommitBatch(
	batchJobId: string,
	examPaper: {
		id: string
		exam_board: string | null
		subject: string
		year: number
	},
): Promise<void> {
	const batch = await db.batchIngestJob.findUniqueOrThrow({
		where: { id: batchJobId },
		select: { uploaded_by: true },
	})

	const stagedScripts = await db.stagedScript.findMany({
		where: { batch_job_id: batchJobId, status: "excluded" },
	})

	await db.stagedScript.updateMany({
		where: { batch_job_id: batchJobId, status: "excluded" },
		data: { status: "confirmed" as StagedScriptStatus },
	})

	const createdJobs = await Promise.all(
		stagedScripts.map((script) => {
			const pageKeys = script.page_keys as PageKey[]
			return db.studentPaperJob.create({
				data: {
					s3_key: pageKeys[0]?.s3_key ?? "",
					s3_bucket: Resource.ScansBucket.name,
					status: "pending",
					uploaded_by: batch.uploaded_by,
					exam_paper_id: examPaper.id,
					exam_board: examPaper.exam_board ?? "Unknown",
					subject: examPaper.subject as never,
					year: examPaper.year,
					pages: pageKeys.map(({ s3_key, order, mime_type }) => ({
						key: s3_key,
						order,
						mime_type,
					})) as never,
					student_name: script.proposed_name,
					batch_job_id: batchJobId,
					staged_script_id: script.id,
				},
			})
		}),
	)

	await db.batchIngestJob.update({
		where: { id: batchJobId },
		data: {
			status: "marking" as BatchStatus,
			total_student_jobs: createdJobs.length,
		},
	})

	for (const job of createdJobs) {
		await sqs.send(
			new SendMessageCommand({
				QueueUrl: Resource.StudentPaperOcrQueue.url,
				MessageBody: JSON.stringify({ job_id: job.id }),
			}),
		)
	}
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function scriptCountIsPlausible(
	detectedCount: number,
	pagesPerScript: number,
	totalPages: number,
): boolean {
	if (totalPages === 0) return false
	const min = totalPages / (pagesPerScript * 3)
	const max = totalPages / (pagesPerScript * 0.5)
	return detectedCount >= min && detectedCount <= max
}

async function runBatch<T, R>(
	items: T[],
	fn: (item: T) => Promise<R>,
	batchSize: number,
): Promise<R[]> {
	const results: R[] = []
	for (let i = 0; i < items.length; i += batchSize) {
		const chunk = items.slice(i, i + batchSize)
		const chunkResults = await Promise.all(chunk.map(fn))
		results.push(...chunkResults)
	}
	return results
}

function guessMime(key: string): string {
	const ext = key.toLowerCase().split(".").pop() ?? ""
	const mimeMap: Record<string, string> = {
		pdf: "application/pdf",
		jpg: "image/jpeg",
		jpeg: "image/jpeg",
		png: "image/png",
		gif: "image/gif",
		webp: "image/webp",
	}
	return mimeMap[ext] ?? "application/octet-stream"
}
