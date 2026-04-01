import { inflateSync } from "zlib"
import { db } from "@/db"
import { computeInkDensity } from "@/lib/blank-detection"
import { logger } from "@/lib/logger"
import { s3 } from "@/lib/s3"
import type { SqsEvent, SqsRecord } from "@/lib/sqs-job-runner"
import {
	GetObjectCommand,
	ListObjectsV2Command,
	PutObjectCommand,
} from "@aws-sdk/client-s3"
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs"
import { GoogleGenAI, type Part } from "@google/genai"
import type {
	BatchStatus,
	BlankPageMode,
	StagedScriptStatus,
} from "@mcp-gcse/db"
import { PDFDict, PDFDocument, PDFName, PDFRawStream, PDFRef } from "pdf-lib"
import { Resource } from "sst"

const TAG = "batch-classify"
const sqs = new SQSClient({})
const AUTO_COMMIT_THRESHOLD = 0.9
const BLANK_THRESHOLD = 0.005

// ─── Types ────────────────────────────────────────────────────────────────────

type PageKey = {
	s3_key: string
	order: number
	mime_type: string
	source_file: string
}

/**
 * Represents a single page extracted from a source PDF.
 * jpegKey/jpegBuffer are null for blank pages (no image content).
 */
type PageData = {
	absoluteIndex: number
	jpegKey: string | null
	jpegBuffer: Buffer | null
}

type PageGroup = {
	pages: PageData[]
	proposedName: string | null
	confidence: number
	hasUncertainPage: boolean
}

type StagedScriptData = {
	page_keys: PageKey[]
	proposed_name: string | null
	confidence: number
	hasUncertainPage: boolean
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
	})

	const allStagedScripts: StagedScriptData[] = []
	let totalPages = 0

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
			status: "proposed" as StagedScriptStatus,
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

	logger.info(TAG, "Batch classification complete", {
		batchJobId,
		scriptCount: allStagedScripts.length,
		autoCommitted: shouldAutoCommit,
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

// ─── PDF page extraction (split + JPEG image extraction) ──────────────────────

/**
 * Splits a multi-page PDF into individual pages, extracting the embedded JPEG
 * image from each page's XObject resources. Pages with no extractable JPEG
 * (or very low ink density) are treated as blank (jpegKey/jpegBuffer = null).
 */
async function extractPdfPages(
	pdfBytes: Uint8Array,
	batchJobId: string,
	sourceKey: string,
): Promise<PageData[]> {
	const pdfDoc = await PDFDocument.load(pdfBytes)
	const pageCount = pdfDoc.getPageCount()
	const sourceName =
		sourceKey
			.split("/")
			.pop()
			?.replace(/\.[^/.]+$/, "") ?? "page"

	const pages = await Promise.all(
		Array.from({ length: pageCount }, async (_, i) => {
			const singlePage = await PDFDocument.create()
			const [copiedPage] = await singlePage.copyPages(pdfDoc, [i])
			singlePage.addPage(copiedPage!)
			const singlePageBytes = await singlePage.save()

			const jpegBytes = await extractJpegFromPdfPage(singlePageBytes)
			if (!jpegBytes) {
				return {
					absoluteIndex: i,
					jpegKey: null,
					jpegBuffer: null,
				} satisfies PageData
			}

			const density = await computeInkDensity(jpegBytes)
			if (density < BLANK_THRESHOLD) {
				return {
					absoluteIndex: i,
					jpegKey: null,
					jpegBuffer: null,
				} satisfies PageData
			}

			const jpegKey = `batches/${batchJobId}/pages/${sourceName}-${String(i + 1).padStart(3, "0")}.jpg`
			await s3.send(
				new PutObjectCommand({
					Bucket: Resource.ScansBucket.name,
					Key: jpegKey,
					Body: jpegBytes,
					ContentType: "image/jpeg",
				}),
			)

			return {
				absoluteIndex: i,
				jpegKey,
				jpegBuffer: jpegBytes,
			} satisfies PageData
		}),
	)

	return pages
}

/**
 * Extracts the first JPEG image from a single-page PDF's XObject resources.
 * Handles both /DCTDecode and [ /FlateDecode /DCTDecode ] filter chains.
 * Returns null if no JPEG image is found (blank/non-image page).
 */
async function extractJpegFromPdfPage(
	pdfBytes: Uint8Array,
): Promise<Buffer | null> {
	let pdfDoc: PDFDocument
	try {
		pdfDoc = await PDFDocument.load(pdfBytes)
	} catch {
		return null
	}

	const page = pdfDoc.getPage(0)
	const resources = page.node.Resources()
	if (!resources) return null

	const xObjRef = resources.get(PDFName.of("XObject"))
	if (!xObjRef) return null

	const xObjDictRaw =
		xObjRef instanceof PDFRef ? pdfDoc.context.lookup(xObjRef) : xObjRef
	if (!(xObjDictRaw instanceof PDFDict)) return null

	for (const [, valueRef] of xObjDictRaw.entries()) {
		const rawObj =
			valueRef instanceof PDFRef ? pdfDoc.context.lookup(valueRef) : valueRef
		if (!(rawObj instanceof PDFRawStream)) continue

		const stream = rawObj as PDFRawStream
		const subtypeObj = stream.dict.get(PDFName.of("Subtype"))
		if (!subtypeObj || subtypeObj.toString() !== "/Image") continue

		const filterObj = stream.dict.get(PDFName.of("Filter"))
		const filterStr = filterObj?.toString() ?? ""

		if (filterStr === "/DCTDecode") {
			return Buffer.from(stream.contents)
		}

		// Handle [ /FlateDecode /DCTDecode ] — zlib-wrapped JPEG
		if (filterStr.includes("DCTDecode") && filterStr.includes("FlateDecode")) {
			try {
				return inflateSync(Buffer.from(stream.contents))
			} catch {
				return null
			}
		}
	}

	return null
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

// ─── Gemini: page boundary classifier ────────────────────────────────────────

async function callClassifyPageBoundary(
	prevPage: PageData | null,
	currentPage: PageData,
): Promise<{ isScriptStart: boolean | null; confidence: number }> {
	const ai = new GoogleGenAI({ apiKey: Resource.GeminiApiKey.value })

	const parts: Part[] = []

	if (prevPage?.jpegBuffer) {
		parts.push({
			inlineData: {
				mimeType: "image/jpeg",
				data: prevPage.jpegBuffer.toString("base64"),
			},
		})
	}

	if (currentPage.jpegBuffer) {
		parts.push({
			inlineData: {
				mimeType: "image/jpeg",
				data: currentPage.jpegBuffer.toString("base64"),
			},
		})
	}

	const contextDesc = prevPage?.jpegBuffer
		? "The FIRST image is the PREVIOUS page; the SECOND image is the CURRENT page."
		: "The image is the CURRENT page (no previous page context)."

	parts.push({
		text: `You are analysing scanned student exam scripts.
${contextDesc}
Determine whether the CURRENT page is the FIRST page of a NEW student's exam script.
Structural cues for a new script start: different student name or header at the top, question numbers resetting to the first question, a new paper title or section header, visibly different handwriting style.
Return ONLY valid JSON with no markdown or explanation:
{"isScriptStart":true,"confidence":0.95}`,
	})

	try {
		const response = await ai.models.generateContent({
			model: "gemini-2.5-flash",
			contents: [{ role: "user", parts }],
		})

		const rawText = response.candidates?.[0]?.content?.parts?.[0]?.text ?? ""
		const jsonStr = extractJsonFromResponse(rawText)
		if (!jsonStr) return { isScriptStart: null, confidence: 0.5 }
		const parsed = JSON.parse(jsonStr) as {
			isScriptStart: boolean
			confidence: number
		}

		return {
			isScriptStart:
				typeof parsed.isScriptStart === "boolean" ? parsed.isScriptStart : null,
			confidence:
				typeof parsed.confidence === "number"
					? Math.min(1, Math.max(0, parsed.confidence))
					: 0.5,
		}
	} catch {
		return { isScriptStart: null, confidence: 0.0 }
	}
}

// ─── Gemini: blank page context classifier ────────────────────────────────────

async function callClassifyBlankPage(
	prevPage: PageData | null,
	nextPage: PageData | null,
): Promise<"separator" | "script_page" | "artifact"> {
	const ai = new GoogleGenAI({ apiKey: Resource.GeminiApiKey.value })

	const parts: Part[] = []

	if (prevPage?.jpegBuffer) {
		parts.push({
			inlineData: {
				mimeType: "image/jpeg",
				data: prevPage.jpegBuffer.toString("base64"),
			},
		})
	}
	if (nextPage?.jpegBuffer) {
		parts.push({
			inlineData: {
				mimeType: "image/jpeg",
				data: nextPage.jpegBuffer.toString("base64"),
			},
		})
	}

	const contextDesc =
		prevPage?.jpegBuffer && nextPage?.jpegBuffer
			? "The first image is the page BEFORE the blank; the second image is the page AFTER."
			: prevPage?.jpegBuffer
				? "The image is the page BEFORE the blank (nothing follows)."
				: nextPage?.jpegBuffer
					? "The image is the page AFTER the blank (nothing precedes)."
					: "No surrounding pages available."

	parts.push({
		text: `You are analysing scanned student exam scripts. A blank/near-blank page has been detected.
${contextDesc}
Classify the blank page as exactly one of:
- "separator": a deliberate blank page inserted between two different student scripts
- "script_page": a blank answer page belonging to a student (e.g. a page they left unanswered)
- "artifact": scanner noise, accidental blank, or cover page
Return ONLY valid JSON with no markdown:
{"classification":"separator"}`,
	})

	try {
		const response = await ai.models.generateContent({
			model: "gemini-2.5-flash",
			contents: [{ role: "user", parts }],
		})

		const rawText = response.candidates?.[0]?.content?.parts?.[0]?.text ?? ""
		const jsonStr = extractJsonFromResponse(rawText)
		if (!jsonStr) return "artifact"
		const parsed = JSON.parse(jsonStr) as { classification: string }
		const c = parsed.classification

		if (c === "separator" || c === "script_page" || c === "artifact") {
			return c
		}
		return "artifact"
	} catch {
		return "artifact"
	}
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

async function callExtractNameFromPage(
	jpegBuffer: Buffer,
): Promise<{ name: string | null; confidence: number }> {
	const ai = new GoogleGenAI({ apiKey: Resource.GeminiApiKey.value })

	try {
		const response = await ai.models.generateContent({
			model: "gemini-2.5-flash",
			contents: [
				{
					role: "user",
					parts: [
						{
							inlineData: {
								mimeType: "image/jpeg",
								data: jpegBuffer.toString("base64"),
							},
						},
						{
							text: 'Extract the student name from this exam script page if legible. Return ONLY valid JSON with no markdown: {"name":"<name>","confidence":0.95} — use null for name if not readable.',
						},
					],
				},
			],
		})

		const rawText = response.candidates?.[0]?.content?.parts?.[0]?.text ?? ""
		const jsonStr = extractJsonFromResponse(rawText)
		if (!jsonStr) return { name: null, confidence: 0.0 }
		const parsed = JSON.parse(jsonStr) as {
			name: string | null
			confidence: number
		}

		return {
			name:
				typeof parsed.name === "string" && parsed.name.trim()
					? parsed.name.trim()
					: null,
			confidence:
				typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
		}
	} catch {
		return { name: null, confidence: 0.0 }
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
		where: { batch_job_id: batchJobId, status: "proposed" },
	})

	await db.stagedScript.updateMany({
		where: { batch_job_id: batchJobId, status: "proposed" },
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

	for (let i = 0; i < createdJobs.length; i++) {
		const job = createdJobs[i]!
		const script = stagedScripts[i]!
		await db.stagedScript.update({
			where: { id: script.id },
			data: { student_job_id: job.id },
		})
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

async function fetchS3Bytes(bucket: string, key: string): Promise<Uint8Array> {
	const cmd = new GetObjectCommand({ Bucket: bucket, Key: key })
	const response = await s3.send(cmd)
	const arr = await response.Body?.transformToByteArray()
	if (!arr?.length) throw new Error(`Empty S3 object: ${key}`)
	return arr
}

/**
 * Extracts the first JSON object from a Gemini response string.
 * Handles thinking-model output that may include preamble text or reasoning.
 */
function extractJsonFromResponse(rawText: string): string | null {
	const start = rawText.indexOf("{")
	const end = rawText.lastIndexOf("}")
	if (start === -1 || end === -1 || end < start) return null
	return rawText.slice(start, end + 1)
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
