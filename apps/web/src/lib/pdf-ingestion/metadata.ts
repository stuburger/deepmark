"use server"

import { db } from "@/lib/db"
import {
	CopyObjectCommand,
	GetObjectCommand,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import type { Subject, TierLevel } from "@mcp-gcse/db"
import { Output, generateText } from "ai"
import { Resource } from "sst"
import { z } from "zod"
import { auth } from "../auth"
import { callLlmWithFallback } from "../llm-runtime"
import { log } from "../logger"

const TAG = "pdf-metadata-actions"
const s3 = new S3Client({})
const bucketName = Resource.ScansBucket.name

/**
 * Prefix that has no S3 event notifications — safe for staging uploads before
 * the teacher confirms details and triggers the real ingestion pipeline.
 */
const METADATA_TEMP_PREFIX = "pdfs/metadata-temp"

const MetadataSchema = z.object({
	title: z
		.string()
		.describe("Full exam paper title, e.g. 'AQA Biology Paper 1 Higher Tier'"),
	subject: z
		.string()
		.describe(
			"Subject as a lowercase slug: biology, chemistry, physics, english, english_literature, mathematics, history, geography, computer_science, french, spanish, religious_studies, business",
		),
	exam_board: z
		.string()
		.describe("Exam board name, e.g. AQA, OCR, Edexcel, WJEC, Cambridge"),
	year: z
		.number()
		.nullable()
		.optional()
		.describe(
			"Year the exam was sat as an integer, e.g. 2023. Null if not found.",
		),
	paper_number: z
		.number()
		.nullable()
		.optional()
		.describe(
			"Paper number as an integer (1, 2, 3…). Null if not found or not applicable.",
		),
	total_marks: z
		.number()
		.describe("Total marks available for the paper (integer)"),
	duration_minutes: z.number().describe("Allowed time in minutes (integer)"),
	document_type: z
		.string()
		.describe(
			"Type of document: 'mark_scheme' if this is a mark scheme or marking guide, 'question_paper' if this is a question paper or exam paper for students, 'exemplar' if this contains exemplar or sample student answers",
		),
	tier: z
		.string()
		.nullable()
		.optional()
		.describe(
			"Tier if printed on the cover: 'foundation' or 'higher'. Null if the paper is untiered (e.g. English, History) or the tier is not visible.",
		),
})

import type {
	DetectedPdfMetadata,
	IngestionSlot,
	PdfDocumentType,
} from "./types"
export type {
	DetectedPdfMetadata,
	IngestionSlot,
	PdfDocumentType,
} from "./types"

export type RequestMetadataUploadResult =
	| { ok: true; url: string; s3Key: string }
	| { ok: false; error: string }

/**
 * Returns a presigned PUT URL for a temp S3 location that does NOT trigger
 * any ingestion pipeline. Use this to stage the PDF before metadata extraction.
 */
export async function requestMetadataUpload(): Promise<RequestMetadataUploadResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const id = crypto.randomUUID()
	const s3Key = `${METADATA_TEMP_PREFIX}/${id}/document.pdf`

	const command = new PutObjectCommand({
		Bucket: bucketName,
		Key: s3Key,
		ContentType: "application/pdf",
	})
	const url = await getSignedUrl(s3, command, { expiresIn: 3600 })

	log.info(TAG, "Metadata temp upload URL created", {
		userId: session.userId,
		s3Key,
	})

	return { ok: true, url, s3Key }
}

export type ExtractPdfMetadataResult =
	| { ok: true; metadata: DetectedPdfMetadata }
	| { ok: false; error: string }

/**
 * Fetches the PDF from the temp S3 key, sends it to Gemini Flash for fast
 * metadata extraction, and returns the detected fields.
 *
 * Covers: title, subject, exam board, year, paper number, total marks,
 * duration, and document type (mark_scheme / question_paper / exemplar).
 */
export async function extractPdfMetadata(
	s3Key: string,
): Promise<ExtractPdfMetadataResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	if (!s3Key.startsWith(METADATA_TEMP_PREFIX)) {
		return { ok: false, error: "Invalid S3 key" }
	}

	log.info(TAG, "extractPdfMetadata called", { userId: session.userId, s3Key })

	try {
		const cmd = new GetObjectCommand({ Bucket: bucketName, Key: s3Key })
		const response = await s3.send(cmd)
		const body = await response.Body?.transformToByteArray()
		if (!body?.length)
			return { ok: false, error: "Could not read uploaded PDF" }
		const pdfBase64 = Buffer.from(body).toString("base64")

		const { output: raw } = await callLlmWithFallback(
			"pdf-metadata-detection",
			async (model, entry, report) => {
				const result = await generateText({
					model,
					temperature: entry.temperature,
					messages: [
						{
							role: "user",
							content: [
								{
									type: "file",
									data: pdfBase64,
									mediaType: "application/pdf",
								},
								{
									type: "text",
									text: "Look at the header, cover page, and overall structure of this document. Extract the exam paper metadata. For subject, use the lowercase slug that best matches: biology, chemistry, physics, english, english_literature, mathematics, history, geography, computer_science, french, spanish, religious_studies, or business. For document_type: use 'mark_scheme' if this is a mark scheme or marking guide, 'question_paper' if this is a question paper for students to answer, or 'exemplar' if it contains sample student answers. For tier: return 'foundation' or 'higher' only if the cover explicitly states the tier; null otherwise (untiered subjects or tier not printed).",
								},
							],
						},
					],
					output: Output.object({ schema: MetadataSchema }),
				})
				report.usage = result.usage
				return result
			},
		)

		const documentType: PdfDocumentType =
			raw.document_type === "mark_scheme" ||
			raw.document_type === "question_paper" ||
			raw.document_type === "exemplar"
				? raw.document_type
				: "question_paper"

		const tier: "foundation" | "higher" | null =
			raw.tier === "foundation" || raw.tier === "higher" ? raw.tier : null

		const metadata: DetectedPdfMetadata = {
			title: raw.title,
			subject: raw.subject,
			exam_board: raw.exam_board,
			year: raw.year ?? null,
			paper_number: raw.paper_number ?? null,
			total_marks: raw.total_marks,
			duration_minutes: raw.duration_minutes,
			document_type: documentType,
			tier,
		}

		log.info(TAG, "Metadata extracted", {
			userId: session.userId,
			s3Key,
			subject: metadata.subject,
			exam_board: metadata.exam_board,
			document_type: metadata.document_type,
		})

		return { ok: true, metadata }
	} catch (err) {
		log.error(TAG, "extractPdfMetadata failed", {
			userId: session.userId,
			s3Key,
			error: String(err),
		})
		return { ok: false, error: "Failed to extract metadata from PDF" }
	}
}

export type CreateExamPaperWithIngestionInput = {
	/** The temp S3 key returned by requestMetadataUpload + extractPdfMetadata. */
	s3MetadataKey: string
	title: string
	subject: Subject
	exam_board: string
	year: number
	paper_number?: number
	total_marks: number
	duration_minutes: number
	document_type: PdfDocumentType
	/** Foundation/Higher if known; null for untiered subjects or unknown. */
	tier?: TierLevel | null
	/** Defaults to false — can be very expensive. Only enable for mark schemes. */
	run_adversarial_loop?: boolean
}

export type CreateExamPaperWithIngestionResult =
	| { ok: true; paperId: string; jobId: string }
	| { ok: false; error: string }

export type CreateExamPaperWithMultipleIngestionsInput = {
	/** At least one slot required. */
	slots: [IngestionSlot, ...IngestionSlot[]]
	title: string
	subject: Subject
	exam_board: string
	year: number
	paper_number?: number
	total_marks: number
	duration_minutes: number
	/** Foundation/Higher if known; null for untiered subjects or unknown. */
	tier?: TierLevel | null
}

export type CreateExamPaperWithMultipleIngestionsResult =
	| { ok: true; paperId: string; jobIds: string[] }
	| { ok: false; error: string }

/**
 * Atomically:
 *  1. Creates the exam paper record.
 *  2. Creates the pdfIngestionJob linked to the paper.
 *  3. Copies the staged temp PDF to the proper ingestion S3 prefix.
 *
 * The copy to the watched prefix automatically triggers the S3 event →
 * SQS → processor Lambda — no manual SQS send needed.
 */
export async function createExamPaperWithIngestion(
	input: CreateExamPaperWithIngestionInput,
): Promise<CreateExamPaperWithIngestionResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	if (!input.s3MetadataKey.startsWith(METADATA_TEMP_PREFIX)) {
		return { ok: false, error: "Invalid staging key" }
	}

	const runAdversarialLoop =
		input.document_type === "mark_scheme"
			? (input.run_adversarial_loop ?? false)
			: false

	log.info(TAG, "createExamPaperWithIngestion called", {
		userId: session.userId,
		subject: input.subject,
		exam_board: input.exam_board,
		document_type: input.document_type,
		run_adversarial_loop: runAdversarialLoop,
	})

	try {
		// 1. Create the exam paper record.
		const paper = await db.examPaper.create({
			data: {
				title: input.title.trim(),
				subject: input.subject,
				exam_board: input.exam_board.trim() || null,
				year: input.year,
				paper_number: input.paper_number ?? null,
				total_marks: input.total_marks,
				duration_minutes: input.duration_minutes,
				created_by_id: session.userId,
				tier: input.tier ?? null,
			},
		})

		// 2. Create the ingestion job (s3_key set after we have the job ID).
		const prefix =
			input.document_type === "mark_scheme"
				? "pdfs/mark-schemes"
				: input.document_type === "question_paper"
					? "pdfs/question-papers"
					: "pdfs/exemplars"

		const job = await db.pdfIngestionJob.create({
			data: {
				document_type: input.document_type,
				s3_key: "",
				s3_bucket: bucketName,
				status: "pending",
				uploaded_by: session.userId,
				exam_board: input.exam_board.trim() || "Other",
				subject: input.subject,
				year: input.year,
				auto_create_exam_paper: false,
				run_adversarial_loop: runAdversarialLoop,
				exam_paper_id: paper.id,
			},
		})

		const destKey = `${prefix}/${job.id}/document.pdf`

		await db.pdfIngestionJob.update({
			where: { id: job.id },
			data: { s3_key: destKey },
		})

		// 3. Copy the staged PDF to the watched prefix.
		//    This triggers the S3 event → SQS → processor automatically.
		await s3.send(
			new CopyObjectCommand({
				Bucket: bucketName,
				CopySource: `${bucketName}/${input.s3MetadataKey}`,
				Key: destKey,
				ContentType: "application/pdf",
			}),
		)

		log.info(TAG, "Exam paper and ingestion job created", {
			userId: session.userId,
			paperId: paper.id,
			jobId: job.id,
			destKey,
			document_type: input.document_type,
		})

		return { ok: true, paperId: paper.id, jobId: job.id }
	} catch (err) {
		log.error(TAG, "createExamPaperWithIngestion failed", {
			userId: session.userId,
			error: String(err),
		})
		return { ok: false, error: "Failed to create exam paper" }
	}
}

/**
 * Creates one exam paper record and N ingestion jobs in parallel (one per slot).
 * Each slot's temp PDF is copied to the appropriate watched S3 prefix, which
 * automatically triggers the relevant SQS queue and Lambda processor.
 */
export async function createExamPaperWithMultipleIngestions(
	input: CreateExamPaperWithMultipleIngestionsInput,
): Promise<CreateExamPaperWithMultipleIngestionsResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	for (const slot of input.slots) {
		if (!slot.s3MetadataKey.startsWith(METADATA_TEMP_PREFIX)) {
			return { ok: false, error: "Invalid staging key" }
		}
	}

	log.info(TAG, "createExamPaperWithMultipleIngestions called", {
		userId: session.userId,
		subject: input.subject,
		exam_board: input.exam_board,
		slot_count: input.slots.length,
		document_types: input.slots.map((s) => s.document_type),
	})

	try {
		const paper = await db.examPaper.create({
			data: {
				title: input.title.trim(),
				subject: input.subject,
				exam_board: input.exam_board.trim() || null,
				year: input.year,
				paper_number: input.paper_number ?? null,
				total_marks: input.total_marks,
				duration_minutes: input.duration_minutes,
				created_by_id: session.userId,
				tier: input.tier ?? null,
			},
		})

		const jobIds = await Promise.all(
			input.slots.map(async (slot) => {
				const runAdversarialLoop =
					slot.document_type === "mark_scheme"
						? (slot.run_adversarial_loop ?? false)
						: false

				const prefix =
					slot.document_type === "mark_scheme"
						? "pdfs/mark-schemes"
						: slot.document_type === "question_paper"
							? "pdfs/question-papers"
							: "pdfs/exemplars"

				const job = await db.pdfIngestionJob.create({
					data: {
						document_type: slot.document_type,
						s3_key: "",
						s3_bucket: bucketName,
						status: "pending",
						uploaded_by: session.userId,
						exam_board: input.exam_board.trim() || "Other",
						subject: input.subject,
						year: input.year,
						auto_create_exam_paper: false,
						run_adversarial_loop: runAdversarialLoop,
						exam_paper_id: paper.id,
					},
				})

				const destKey = `${prefix}/${job.id}/document.pdf`

				await db.pdfIngestionJob.update({
					where: { id: job.id },
					data: { s3_key: destKey },
				})

				await s3.send(
					new CopyObjectCommand({
						Bucket: bucketName,
						CopySource: `${bucketName}/${slot.s3MetadataKey}`,
						Key: destKey,
						ContentType: "application/pdf",
					}),
				)

				log.info(TAG, "Ingestion job created", {
					userId: session.userId,
					paperId: paper.id,
					jobId: job.id,
					destKey,
					document_type: slot.document_type,
				})

				return job.id
			}),
		)

		log.info(TAG, "All ingestion jobs created", {
			userId: session.userId,
			paperId: paper.id,
			jobIds,
		})

		return { ok: true, paperId: paper.id, jobIds }
	} catch (err) {
		log.error(TAG, "createExamPaperWithMultipleIngestions failed", {
			userId: session.userId,
			error: String(err),
		})
		return { ok: false, error: "Failed to create exam paper" }
	}
}
